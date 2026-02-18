# Nginx Conf.d Plugin

A plugin for SLA Wizard that generates nginx configuration in a modular structure, splitting the configuration into a main file and user-specific configuration files.

## Overview

Instead of generating a single monolithic `nginx.conf` file, this plugin creates:

- **nginx.conf**: Main configuration with server block structure
- **conf.d/**: Directory containing individual `.conf` files for each SLA user

Each user's configuration file includes:

- Rate limiting zones (`limit_req_zone`)
- API key mapping (`map $http_apikey $api_client_name`)
- Location blocks for their endpoints

## Installation

This plugin is already available as a local plugin in the `plugins/` directory. No additional installation is required.

## Usage

### 1. Full Configuration (Initial Setup)

Generates both the main `nginx.conf` and the `conf.d/` directory.

```bash
node src/index.js config-nginx-confd -o <output-directory> --sla <sla-path> --oas <oas-path>
```

### 2. Incremental Update (Add to conf.d)

Generates ONLY the configuration files for `conf.d` directory. Useful for adding new SLAs without modifying the main `nginx.conf`.

```bash
node src/index.js add-to-confd -o <output-directory> --sla <sla-path> --oas <oas-path>
```

### 3. Incremental Update (Remove from conf.d)

Removes configuration files from `conf.d` directory based on the provided SLA.

```bash
node src/index.js remove-from-confd -o <output-directory> --sla <sla-path>
```

## Practical Test Commands

Use these commands with the provided example files to quickly test the plugin:

```bash
# Test 1: Generate full configuration in 'test-nginx-full'
node src/index.js config-nginx-confd -o ./output --sla specs/slas --oas specs/hpc-oas.yaml

# Test 2: Add new SLA to 'test-nginx-full' without overwriting nginx.conf
node src/index.js add-to-confd -o ./output --sla examples/silver-sla.yaml --oas examples/petstore-oas.yaml

# Test 3: Remove the SLA configuration from 'test-nginx-full'
node src/index.js remove-from-confd -o ./output --sla examples/silver-sla.yaml
```

### Example

```bash
node src/index.js config-nginx-confd -o ./nginx-config --sla example/slas --oas example/hpc-oas.yaml
```

This will generate:

```
nginx-config/
├── nginx.conf
└── conf.d/
    ├── sla-dgalvan_us.conf
    ├── sla-japarejo_us.conf
    └── sla-pablofm_us.conf
```

### Options

| Option                      | Description                                 | Default            |
| --------------------------- | ------------------------------------------- | ------------------ |
| `-o, --outDir <directory>`  | Output directory for nginx.conf and conf.d/ | Required           |
| `--sla <path>`              | Path to SLA file(s) or directory            | `./specs/sla.yaml` |
| `--oas <path>`              | Path to OAS v3 file                         | `./specs/oas.yaml` |
| `--authLocation <location>` | Auth parameter location: header, query, url | `header`           |
| `--authName <name>`         | Auth parameter name                         | `apikey`           |
| `--proxyPort <port>`        | Proxy port                                  | `80`               |

## Generated Structure

### Main nginx.conf

Contains the server block structure and includes user configurations:

```nginx
events {}
http {
    limit_req_status 429;
    map_hash_bucket_size 128;

    server {
        listen 80;

        if ($http_apikey = "") {
            return 401; # Unauthorized
        }
        if ($api_client_name = "") {
            return 403; # Forbidden
        }

        set $uri_original $uri;

        if ($uri = /v1/chat/completions) {
          rewrite /v1/chat/completions "/${api_client_name}_v1chatcompletions_${request_method}" break;
        }

        # Include user-specific configurations
        include conf.d/*.conf;
    }
}
```

### User Configuration Files (conf.d/)

Each user gets a separate file with their specific configuration:

```nginx
# Rate limiting zones
limit_req_zone $http_apikey zone=sla-user_plan_endpoint_METHOD:10m rate=5r/m;

# API key mapping
map $http_apikey $api_client_name {
    default "";
   "~(apikey-hash)" "sla-user_plan";
}

# Endpoint locations
location /sla-user_plan_endpoint_METHOD {
    rewrite /sla-user_plan_endpoint_METHOD $uri_original break;
    proxy_pass http://localhost:8000;
    limit_req zone=sla-user_plan_endpoint_METHOD burst=1 nodelay;
}
```

## Benefits

1. **Modularity**: Each user's configuration is isolated in its own `.conf` file.
2. **Incremental Updates**: Use `add-to-confd` to add new configurations without re-generating or risking the main `nginx.conf`.
3. **Maintainability**: Easy to modify, enable, or disable individual user configurations by simply adding/removing files from `conf.d/`.
4. **Clarity**: The main `nginx.conf` remains clean and focused on global server settings.
5. **Scalability**: Supporting hundreds of users is easy as nginx efficiently handles multiple includes.
6. **Standard Practice**: Follows the industry-standard `conf.d` pattern used by Nginx, making it familiar to DevOps engineers.

## Deployment

To use the generated configuration with nginx:

1. Copy the entire output directory to your nginx configuration location
2. Update the main nginx.conf path in your nginx startup
3. Ensure the relative path to conf.d/ is correct

Example:

```bash
cp -r nginx-config/* /etc/nginx/
nginx -t  # Test configuration
nginx -s reload  # Reload nginx
```

## License

Same as SLA Wizard - Apache License 2.0
