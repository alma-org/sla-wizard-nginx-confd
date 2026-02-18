// plugins/nginx-confd.js
const fs = require("fs");
const path = require("path");

/**
 * Plugin that generates nginx configuration split into:
 * - Main nginx.conf with server block structure
 * - Individual conf.d/<user>.conf files with limit_req_zone, map, and location blocks
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

  // Parse the configuration
  const lines = fullConfig.split("\n");

  // Extract components
  const limitReqZones = [];
  const mapBlocks = [];
  const locationBlocks = [];
  let mainConfig = [];

  let inMapBlock = false;
  let inLocationBlock = false;
  let currentBlock = [];
  let currentBlockName = "";
  let mapBlockContent = [];
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Extract limit_req_zone lines
    if (trimmedLine.startsWith("limit_req_zone")) {
      limitReqZones.push(line);
      continue;
    }

    // Track map blocks
    if (trimmedLine.startsWith("map $")) {
      inMapBlock = true;
      mapBlockContent = [line];
      braceCount =
        (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      continue;
    }

    if (inMapBlock) {
      mapBlockContent.push(line);
      braceCount +=
        (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

      if (braceCount === 0) {
        mapBlocks.push(mapBlockContent.join("\n"));
        inMapBlock = false;
        mapBlockContent = [];
      }
      continue;
    }

    // Track location blocks
    if (trimmedLine.startsWith("location /sla-")) {
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
    // Format: sla-<context_id>_<plan>_<endpoint>_<method>
    const parts = block.name.split("_");
    if (parts.length >= 2) {
      // Find where the context_id ends and plan begins
      // We need to reconstruct the user key from the location name
      const userKey = extractUserKey(block.name, limitReqZones);

      if (!userGroups[userKey]) {
        userGroups[userKey] = {
          limitReqZones: [],
          mapEntries: [],
          locations: [],
        };
      }

      userGroups[userKey].locations.push(block.content);
    }
  });

  limitReqZones.forEach((zone) => {
    const zoneName = zone.match(/zone=([^:]+)/);
    if (zoneName) {
      const userKey = extractUserKeyFromZone(zoneName[1]);
      if (userGroups[userKey]) {
        userGroups[userKey].limitReqZones.push(zone);
      }
    }
  });

  if (mapBlocks.length > 0) {
    const mapContent = mapBlocks[0];
    const mapLines = mapContent.split("\n");

    mapLines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('"~(') && trimmed.includes(")")) {
        // Extract the user identifier from the map entry
        // Format: "~(apikey)" "sla-context_id_plan";
        const match = trimmed.match(/"([^"]+)"\s*;/);
        if (match) {
          const userIdentifier = match[1];
          const userKey = extractUserKeyFromIdentifier(userIdentifier);

          if (userGroups[userKey]) {
            userGroups[userKey].mapEntries.push(line);
          }
        }
      }
    });
  }

  // Generate conf.d files for each user
  Object.keys(userGroups).forEach((userKey) => {
    const group = userGroups[userKey];
    let userConfig = "";

    // Add limit_req_zones
    if (group.limitReqZones.length > 0) {
      userConfig += "# Rate limiting zones\n";
      userConfig +=
        group.limitReqZones.map((line) => line.trim()).join("\n") + "\n\n";
    }

    // Add map block
    if (group.mapEntries.length > 0) {
      userConfig += "# API key mapping\n";
      userConfig += "map $http_apikey $api_client_name {\n";
      userConfig += '    default "";\n';
      userConfig +=
        group.mapEntries.map((line) => "   " + line.trim()).join("\n") + "\n";
      userConfig += "}\n\n";
    }

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
  }
}

/**
 * Extract user key from location name
 */
function extractUserKey(locationName, limitReqZones) {
  // Try to match with limit_req_zones to find the exact user key
  for (const zone of limitReqZones) {
    const zoneName = zone.match(/zone=([^:]+)/);
    if (zoneName && locationName.includes(zoneName[1])) {
      return extractUserKeyFromZone(zoneName[1]);
    }
  }

  // Fallback: extract from location name pattern
  // Format: sla-<context_id>_<plan>_...
  const match = locationName.match(/^sla-([^_]+)_([^_]+)_/);
  if (match) {
    return `sla-${match[1]}_${match[2]}`;
  }

  return locationName;
}

/**
 * Extract user key from zone name
 */
function extractUserKeyFromZone(zoneName) {
  // Format: sla-<context_id>_<plan>_<endpoint>_<method>
  const match = zoneName.match(/^(sla-[^_]+_[^_]+)_/);
  return match ? match[1] : zoneName;
}

/**
 * Extract user key from map identifier
 */
function extractUserKeyFromIdentifier(identifier) {
  // Format: sla-context_id_plan
  const match = identifier.match(/^(sla-[^_]+_[^_]+)/);
  return match ? match[1] : identifier;
}

module.exports = { apply, configNginxConfd, addToConfd, removeFromConfd };
