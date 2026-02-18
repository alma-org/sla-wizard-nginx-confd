const { expect } = require("chai");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const slaWizard = require("sla-wizard");

const nginxConfdPlugin = require("../index.js");

slaWizard.use(nginxConfdPlugin);

const slaWizardCLIPath = path.join(__dirname, "cli-with-plugin.js");

const OAS_PATH = path.join(__dirname, "../examples/test-oas.yaml");
const SLA_PATH = path.join(__dirname, "../examples/test-sla.yaml");
const OUTPUT_DIR = path.join(__dirname, "./test-plugin-output");

describe("SLA Wizard Plugin Test Suite", function () {
  this.timeout(10000);

  before(function () {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  after(function () {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe("Nginx-Confd Plugin Programmatic API", function () {
    it("should expose plugin methods (configNginxConfd)", function () {
      expect(slaWizard.configNginxConfd).to.be.a("function");
      const outDir = path.join(OUTPUT_DIR, "prog-nginx-confd");
      slaWizard.configNginxConfd({ outDir, oas: OAS_PATH, sla: SLA_PATH });
      expect(fs.existsSync(path.join(outDir, "nginx.conf"))).to.be.true;
      expect(fs.existsSync(path.join(outDir, "conf.d/sla-test_test-plan.conf")))
        .to.be.true;
    });

    it("should expose plugin methods (addToConfd)", function () {
      expect(slaWizard.addToConfd).to.be.a("function");
      const outDir = path.join(OUTPUT_DIR, "prog-add-to-confd");
      slaWizard.addToConfd({ outDir, oas: OAS_PATH, sla: SLA_PATH });
      expect(fs.existsSync(path.join(outDir, "nginx.conf"))).to.be.false;
      expect(fs.existsSync(path.join(outDir, "conf.d/sla-test_test-plan.conf")))
        .to.be.true;
    });

    it("should expose plugin methods (removeFromConfd)", function () {
      expect(slaWizard.removeFromConfd).to.be.a("function");
      const outDir = path.join(OUTPUT_DIR, "prog-remove-from-confd");
      // First create it
      slaWizard.addToConfd({ outDir, oas: OAS_PATH, sla: SLA_PATH });
      expect(fs.existsSync(path.join(outDir, "conf.d/sla-test_test-plan.conf")))
        .to.be.true;

      // Then remove it
      slaWizard.removeFromConfd({ outDir, sla: SLA_PATH });
      expect(fs.existsSync(path.join(outDir, "conf.d/sla-test_test-plan.conf")))
        .to.be.false;
    });
  });

  describe("Nginx-Confd Plugin CLI Usage", function () {
    it("should run plugin commands via CLI (config-nginx-confd)", function () {
      const outDir = path.join(OUTPUT_DIR, "cli-nginx-confd");
      const cmd = `node "${slaWizardCLIPath}" config-nginx-confd -o "${outDir}" --oas "${OAS_PATH}" --sla "${SLA_PATH}"`;
      execSync(cmd);
      expect(fs.existsSync(path.join(outDir, "nginx.conf"))).to.be.true;
    });

    it("should run plugin commands via CLI (add-to-confd)", function () {
      const outDir = path.join(OUTPUT_DIR, "cli-add-to-confd");
      const cmd = `node "${slaWizardCLIPath}" add-to-confd -o "${outDir}" --oas "${OAS_PATH}" --sla "${SLA_PATH}"`;
      execSync(cmd);
      expect(fs.existsSync(path.join(outDir, "nginx.conf"))).to.be.false;
      expect(fs.existsSync(path.join(outDir, "conf.d/sla-test_test-plan.conf")))
        .to.be.true;
    });

    it("should run plugin commands via CLI (remove-from-confd)", function () {
      const outDir = path.join(OUTPUT_DIR, "cli-remove-from-confd");
      // Create
      execSync(
        `node "${slaWizardCLIPath}" add-to-confd -o "${outDir}" --oas "${OAS_PATH}" --sla "${SLA_PATH}"`,
      );
      expect(fs.existsSync(path.join(outDir, "conf.d/sla-test_test-plan.conf")))
        .to.be.true;

      // Remove
      const cmd = `node "${slaWizardCLIPath}" remove-from-confd -o "${outDir}" --sla "${SLA_PATH}"`;
      execSync(cmd);
      expect(fs.existsSync(path.join(outDir, "conf.d/sla-test_test-plan.conf")))
        .to.be.false;
    });
  });
});
