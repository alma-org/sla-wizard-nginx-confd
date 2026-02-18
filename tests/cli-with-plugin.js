#!/usr/bin/env node
/**
 * CLI wrapper for tests: loads sla-wizard, registers the nginx-confd plugin,
 * then delegates to sla-wizard's CLI runner.
 *
 * Usage: node cli-with-plugin.js <command> [options]
 */
const slaWizard = require("sla-wizard");
const nginxConfdPlugin = require("../index.js");

// Register the plugin so its commands are available on the CLI program
slaWizard.use(nginxConfdPlugin);

// Parse process.argv and run the matched command
slaWizard.program.parse(process.argv);
