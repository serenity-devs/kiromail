import assert from "node:assert/strict";
import test from "node:test";
import {
  panelPath,
  panelSectionFromPathname,
  panelSectionFromSlug,
  panelSectionPaths,
} from "../lib/panel-navigation";

test("every panel section has a stable, unique URL", () => {
  const paths = Object.values(panelSectionPaths);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(panelPath("dashboard"), "/");
  assert.equal(panelPath("transactional"), "/transaccionales");
  assert.equal(panelPath("settings"), "/ajustes");
});

test("panel URLs restore the matching React section", () => {
  assert.equal(panelSectionFromPathname("/"), "dashboard");
  assert.equal(panelSectionFromPathname("/suscriptores/"), "contacts");
  assert.equal(panelSectionFromPathname("/transaccionales"), "transactional");
  assert.equal(panelSectionFromPathname("/ajustes"), "settings");
});

test("unknown and nested paths are not mistaken for panel sections", () => {
  assert.equal(panelSectionFromSlug("login"), null);
  assert.equal(panelSectionFromPathname("/desconocida"), null);
  assert.equal(panelSectionFromPathname("/plantillas/nueva"), null);
});
