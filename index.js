// plugins/nginx-confd.js
const fs = require("fs");
const path = require("path");

/**
 * Plugin that generates nginx configuration split into:
 * - Main nginx.conf with server block structure (includes http-level directives)
 * - Individual conf.d/<user>.conf files with location blocks only
 *
 * @param {Object} program - Commander program instance
 * @param {Object} ctx - Context with utils and generate functions
 */
function apply(program, ctx) {
  program
    .command("config-nginx-confd")
    .description(
      "Generate nginx configuration split into main file and conf.d directory",
    )
    .requiredOption(
      "-o, --outDir <outputDirectory>",
      "Output directory for nginx.conf and conf.d/",
    )
    .option(
      "--sla <slaPath>",
      "One of: 1) single SLA, 2) folder of SLAs, 3) URL returning an array of SLA objects",
      "./specs/sla.yaml",
    )
    .option("--oas <pathToOAS>", "Path to an OAS v3 file.", "./specs/oas.yaml")
    .option(
      "--customTemplate <customTemplate>",
      "Custom proxy configuration template.",
    )
    .option(
      "--authLocation <authLocation>",
      "Where to look for the authentication parameter. Must be one of: header, query, url.",
      "header",
    )
    .option(
      "--authName <authName>",
      'Name of the authentication parameter, such as "token" or "apikey".',
      "apikey",
    )
    .option("--proxyPort <proxyPort>", "Port on which the proxy is running", 80)
    .action(function (options) {
      configNginxConfd(options, ctx);
    });

  program
    .command("add-to-confd")
    .description(
      "Generate configuration files for conf.d directory without creating nginx.conf",
    )
    .requiredOption(
      "-o, --outDir <outputDirectory>",
      "Output directory for conf.d/",
    )
    .option(
      "--sla <slaPath>",
      "One of: 1) single SLA, 2) folder of SLAs, 3) URL returning an array of SLA objects",
      "./specs/sla.yaml",
    )
    .option("--oas <pathToOAS>", "Path to an OAS v3 file.", "./specs/oas.yaml")
    .option(
      "--customTemplate <customTemplate>",
      "Custom proxy configuration template.",
    )
    .option(
      "--authLocation <authLocation>",
      "Where to look for the authentication parameter. Must be one of: header, query, url.",
      "header",
    )
    .option(
      "--authName <authName>",
      'Name of the authentication parameter, such as "token" or "apikey".',
      "apikey",
    )
    .option("--proxyPort <proxyPort>", "Port on which the proxy is running", 80)
    .action(function (options) {
      addToConfd(options, ctx);
    });

  program
    .command("remove-from-confd")
    .description(
      "Remove configuration files from conf.d directory based on an SLA",
    )
    .requiredOption(
      "-o, --outDir <outputDirectory>",
      "Output directory containing conf.d/",
    )
    .requiredOption(
      "--sla <slaPath>",
      "Path to the SLA file(s) or directory to remove",
    )
    .action(function (options) {
      removeFromConfd(options, ctx);
    });
}

/**
 * Programmatic logic for config-nginx-confd
 */
function configNginxConfd(options, ctx) {
  const { utils, generate } = ctx;
  options = utils.validateParamsCLI("nginx", options);

  const tempFile = path.join(options.outDir, ".temp-nginx-full.conf");

  if (!fs.existsSync(options.outDir)) {
    fs.mkdirSync(options.outDir, { recursive: true });
  }

  generate.generateConfigHandle(
    options.oas || "./specs/oas.yaml",
    "nginx",
    options.sla || "./specs/sla.yaml",
    tempFile,
    options.customTemplate,
    options.authLocation || "header",
    options.authName || "apikey",
    options.proxyPort || 80,
  );

  const fullConfig = fs.readFileSync(tempFile, "utf8");
  splitNginxConfig(fullConfig, options.outDir);
  fs.unlinkSync(tempFile);

  console.log(`✓ Nginx configuration generated in ${options.outDir}/`);
  console.log(`  - nginx.conf (main configuration)`);
  console.log(`  - conf.d/ (user-specific configurations)`);
}

/**
 * Programmatic logic for add-to-confd
 */
function addToConfd(options, ctx) {
  const { utils, generate } = ctx;
  options = utils.validateParamsCLI("nginx", options);

  const tempFile = path.join(options.outDir, ".temp-nginx-full.conf");

  if (!fs.existsSync(options.outDir)) {
    fs.mkdirSync(options.outDir, { recursive: true });
  }

  generate.generateConfigHandle(
    options.oas || "./specs/oas.yaml",
    "nginx",
    options.sla || "./specs/sla.yaml",
    tempFile,
    options.customTemplate,
    options.authLocation || "header",
    options.authName || "apikey",
    options.proxyPort || 80,
  );

  const fullConfig = fs.readFileSync(tempFile, "utf8");
  splitNginxConfig(fullConfig, options.outDir, true);
  fs.unlinkSync(tempFile);

  console.log(`✓ Nginx configuration generated in ${options.outDir}/`);
  console.log(`  - conf.d/ (user-specific configurations)`);
}

/**
 * Programmatic logic for remove-from-confd
 */
function removeFromConfd(options, ctx) {
  const { utils } = ctx;
  const jsyaml = require("js-yaml");
  const confDDir = path.join(options.outDir, "conf.d");

  if (!fs.existsSync(confDDir)) {
    console.error(`Error: conf.d directory not found in ${options.outDir}`);
    return;
  }

  let SLAs = [];
  try {
    if (fs.lstatSync(options.sla).isDirectory()) {
      fs.readdirSync(options.sla).forEach((file) => {
        if (
          file.endsWith(".yaml") ||
          file.endsWith(".yml") ||
          file.endsWith(".json")
        ) {
          const content = fs.readFileSync(path.join(options.sla, file), "utf8");
          SLAs.push(jsyaml.load(content));
        }
      });
    } else {
      const content = fs.readFileSync(options.sla, "utf8");
      SLAs.push(jsyaml.load(content));
    }
  } catch (err) {
    console.error(`Error reading SLA(s): ${err.message}`);
    return;
  }

  const SLAsFiltered = utils.validateSLAs(SLAs);

  let deletedCount = 0;
  SLAsFiltered.forEach((sla) => {
    const slaContextID = sla.context.id;
    const planName = sla.plan.name;
    const userKey = `${slaContextID}_${planName}`;
    const userConfigFile = path.join(confDDir, `${userKey}.conf`);

    if (fs.existsSync(userConfigFile)) {
      fs.unlinkSync(userConfigFile);
      console.log(`  - Deleted: conf.d/${userKey}.conf`);
      deletedCount++;
      // Also remove the user's http-level directives from nginx.conf
      const mainConfigFile = path.join(options.outDir, "nginx.conf");
      updateNginxConfRemoveUser(userKey, mainConfigFile);
    } else {
      console.log(`  - Not found: conf.d/${userKey}.conf`);
    }
  });

  if (deletedCount > 0) {
    console.log(
      `✓ Successfully removed ${deletedCount} configuration file(s) from ${options.outDir}/conf.d/`,
    );
  } else {
    console.log(`! No matching configuration files were found to remove.`);
  }
}

/**
 * Splits the nginx configuration into main file and conf.d files
 * @param {string} fullConfig - The complete nginx configuration
 * @param {string} outDir - Output directory
 * @param {boolean} skipMainConfig - Whether to skip generating nginx.conf
 */
function splitNginxConfig(fullConfig, outDir, skipMainConfig = false) {
  const confDDir = path.join(outDir, "conf.d");

  // Create conf.d directory
  if (!fs.existsSync(confDDir)) {
    fs.mkdirSync(confDDir, { recursive: true });
  }

  // Parse the configuration.
  // limit_req_zone and map are http-context directives — they must stay in
  // nginx.conf (mainConfig). Only location blocks go into conf.d files, which
  // are included inside the server block.
  const lines = fullConfig.split("\n");

  const locationBlocks = [];
  let mainConfig = [];

  let inLocationBlock = false;
  let currentBlock = [];
  let currentBlockName = "";
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Track location blocks
    if (trimmedLine.startsWith("location /") && !trimmedLine.startsWith("location ~/")) {
      inLocationBlock = true;
      currentBlock = [line];
      // Extract the location name for grouping
      const match = trimmedLine.match(/location\s+\/([^\s{]+)/);
      if (match) {
        currentBlockName = match[1];
      }
      braceCount =
        (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      continue;
    }

    if (inLocationBlock) {
      currentBlock.push(line);
      braceCount +=
        (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

      if (braceCount === 0) {
        locationBlocks.push({
          name: currentBlockName,
          content: currentBlock.join("\n"),
        });
        inLocationBlock = false;
        currentBlock = [];
        currentBlockName = "";
      }
      continue;
    }

    mainConfig.push(line);
  }

  const userGroups = {};

  locationBlocks.forEach((block) => {
    // Extract user identifier from location name
    // Format: <context_id>_<plan>_<endpoint>_<method>
    const parts = block.name.split("_");
    if (parts.length >= 2) {
      const userKey = extractUserKey(block.name);

      if (!userGroups[userKey]) {
        userGroups[userKey] = {
          locations: [],
        };
      }

      userGroups[userKey].locations.push(block.content);
    }
  });

  // Generate conf.d files for each user — only location blocks (server context)
  Object.keys(userGroups).forEach((userKey) => {
    const group = userGroups[userKey];
    let userConfig = "";

    // Add location blocks
    if (group.locations.length > 0) {
      userConfig += "# Endpoint locations\n";
      userConfig +=
        group.locations.map((loc) => loc.trim()).join("\n\n") + "\n";
    }

    // Write user config file
    const userConfigFile = path.join(confDDir, `${userKey}.conf`);
    fs.writeFileSync(userConfigFile, userConfig);
  });

  // Generate main nginx.conf
  if (!skipMainConfig) {
    let mainConfigContent = mainConfig.join("\n");

    // Add include directive before the closing server brace
    const serverClosingIndex = mainConfigContent.lastIndexOf("    }");
    if (serverClosingIndex !== -1) {
      const beforeClosing = mainConfigContent.substring(0, serverClosingIndex);
      const afterClosing = mainConfigContent.substring(serverClosingIndex);
      mainConfigContent =
        beforeClosing +
        "\n        # Include user-specific configurations\n        include conf.d/*.conf;\n\n" +
        afterClosing;
    }

    // Write main config
    const mainConfigFile = path.join(outDir, "nginx.conf");
    fs.writeFileSync(mainConfigFile, mainConfigContent);
  } else {
    // add-to-confd: inject the new user's http-level directives into existing nginx.conf
    const mainConfigFile = path.join(outDir, "nginx.conf");
    updateNginxConfAddUser(fullConfig, mainConfigFile);
  }
}

/**
 * Extract user key from location name
 * Format: <context_id>_<plan>_<endpoint>_<method>
 */
function extractUserKey(locationName) {
  const match = locationName.match(/^([^_]+)_([^_]+)_/);
  if (match) {
    return `${match[1]}_${match[2]}`;
  }
  return locationName;
}

/**
 * Updates an existing nginx.conf to inject a new user's http-level directives
 * (limit_req_zone lines and map entries) extracted from a freshly generated full config.
 * Called by add-to-confd so the new user's rate-limit zones exist in nginx.conf.
 */
function updateNginxConfAddUser(fullConfig, nginxConfPath) {
  if (!fs.existsSync(nginxConfPath)) return;

  const lines = fullConfig.split("\n");
  const newLimitReqZones = [];
  const newMapEntries = [];
  let inMapBlock = false;
  let braceCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("limit_req_zone")) {
      newLimitReqZones.push(trimmed);
      continue;
    }
    if (trimmed.startsWith("map $")) {
      inMapBlock = true;
      braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      continue;
    }
    if (inMapBlock) {
      braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceCount === 0) { inMapBlock = false; continue; }
      if (trimmed && !trimmed.startsWith("default")) {
        newMapEntries.push(trimmed);
      }
    }
  }

  let conf = fs.readFileSync(nginxConfPath, "utf8");

  // Inject new limit_req_zone lines before the limit_req_status directive
  if (newLimitReqZones.length > 0) {
    const injection = newLimitReqZones.map((z) => "    " + z).join("\n") + "\n";
    conf = conf.replace(/(\s*limit_req_status\s+429;)/, "\n" + injection + "$1");
  }

  // Inject new map entries inside the existing map block (before its closing })
  if (newMapEntries.length > 0) {
    const mapHeaderIdx = conf.indexOf("map $");
    if (mapHeaderIdx !== -1) {
      let depth = 0;
      let closeIdx = -1;
      for (let i = mapHeaderIdx; i < conf.length; i++) {
        if (conf[i] === "{") depth++;
        else if (conf[i] === "}" && --depth === 0) { closeIdx = i; break; }
      }
      if (closeIdx !== -1) {
        const injection = newMapEntries.map((e) => "     " + e).join("\n") + "\n";
        conf = conf.slice(0, closeIdx) + injection + conf.slice(closeIdx);
      }
    }
  }

  fs.writeFileSync(nginxConfPath, conf, "utf8");

  // --- Upgrade ratelimiting-less rewrites to rate-limited ---
  // When a new SLA introduces an endpoint that was previously "ratelimiting-less"
  // (present in OAS but absent from all SLAs during the last full regen), the
  // server-level if/rewrite block in nginx.conf is missing the ${api_client_name}_
  // prefix and a stray `location ~` fallback exists. Both must be patched so
  // requests are routed to the correct per-client conf.d location.
  const rateLimitedEndpoints = [];
  // Match rate-limited rewrites in the new full config:
  //   rewrite /... "/${api_client_name}_SANITIZED_${request_method}" break;
  const rateLimitedRe =
    /rewrite\s+\S+\s+"\/\$\{api_client_name\}_([A-Za-z0-9-]+)_\$\{request_method\}"/g;
  let rm;
  while ((rm = rateLimitedRe.exec(fullConfig)) !== null) {
    if (!rateLimitedEndpoints.includes(rm[1])) rateLimitedEndpoints.push(rm[1]);
  }

  if (rateLimitedEndpoints.length > 0) {
    conf = fs.readFileSync(nginxConfPath, "utf8");
    for (const sanitized of rateLimitedEndpoints) {
      const esc = sanitized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Replace ratelimiting-less rewrite (no ${api_client_name}_ prefix) with
      // the rate-limited version.  The negative-lookahead skips lines that are
      // already correct so the replacement is idempotent.
      conf = conf.replace(
        new RegExp(
          `(rewrite\\s+\\S+\\s+)"\\/${esc}_\\$\\{request_method\\}"(\\s+break;)`,
          "g"
        ),
        `$1"/\${api_client_name}_${sanitized}_\${request_method}"$2`
      );

      // Remove the stray `location ~ /SANITIZED_(...)` fallback block.
      // These blocks proxy $uri_original (the un-stripped path) and cause 404s
      // once a proper per-client conf.d location exists.
      conf = conf.replace(
        new RegExp(
          `\\n?[ \\t]*location\\s+~\\s+\\/${esc}_\\([^)]+\\)\\s*\\{[^}]*\\}`,
          "gs"
        ),
        ""
      );
    }
    fs.writeFileSync(nginxConfPath, conf, "utf8");
  }
}

/**
 * Updates an existing nginx.conf to remove a user's http-level directives
 * (limit_req_zone lines and map entry) when that user is deleted from conf.d.
 */
function updateNginxConfRemoveUser(userKey, nginxConfPath) {
  if (!fs.existsSync(nginxConfPath)) return;

  let conf = fs.readFileSync(nginxConfPath, "utf8");

  // Remove limit_req_zone lines whose zone name starts with <userKey>_
  conf = conf.replace(
    new RegExp(`[^\\n]*limit_req_zone[^\\n]+zone=${escapeRegex(userKey)}_[^\\n]*\\n?`, "g"),
    ""
  );

  // Remove the map entry for this user: lines of the form "~(...)" "userKey";
  conf = conf.replace(
    new RegExp(`[^\\n]*"~\\([^)]+\\)"\\s+"${escapeRegex(userKey)}";[^\\n]*\\n?`, "g"),
    ""
  );

  fs.writeFileSync(nginxConfPath, conf, "utf8");
}

/** Escapes special regex characters in a string. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { apply, configNginxConfd, addToConfd, removeFromConfd };
