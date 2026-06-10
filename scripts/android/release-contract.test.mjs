import assert from "node:assert/strict";
import test from "node:test";

import {
  ANDROID_PACKAGE_NAME,
  RELEASE_CERT_SHA256,
  createUpdateManifest,
  parseAaptIdentity,
  parseAndroidVersion,
  parseSignerDigest,
  validateReleaseIdentity,
} from "./release-contract.mjs";

test("lee versionCode y versionName desde Gradle", () => {
  assert.deepEqual(
    parseAndroidVersion(`
      versionCode 14
      versionName "1.3.6"
    `),
    { versionCode: 14, versionName: "1.3.6" },
  );
});

test("lee identidad y certificado desde las herramientas Android", () => {
  assert.deepEqual(
    parseAaptIdentity(
      "package: name='com.mhl.music' versionCode='14' versionName='1.3.6'",
    ),
    {
      packageName: ANDROID_PACKAGE_NAME,
      versionCode: 14,
      versionName: "1.3.6",
    },
  );
  assert.equal(
    parseSignerDigest(`Signer #1 certificate SHA-256 digest: ${RELEASE_CERT_SHA256}`),
    RELEASE_CERT_SHA256,
  );
});

test("genera el manifiesto canónico sin duplicar el digest", () => {
  const manifest = createUpdateManifest({ versionCode: 14, versionName: "1.3.6" });
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    packageName: ANDROID_PACKAGE_NAME,
    versionName: "1.3.6",
    versionCode: 14,
    apkAssetName: "MHL-Music-1.3.6.apk",
  });
  assert.equal("digest" in manifest, false);
});

test("rechaza versiones desalineadas y certificados distintos", () => {
  const validIdentity = {
    packageName: ANDROID_PACKAGE_NAME,
    versionCode: 14,
    versionName: "1.3.6",
  };
  assert.throws(
    () =>
      validateReleaseIdentity({
        packageVersion: "1.3.5",
        gradleVersion: { versionCode: 14, versionName: "1.3.6" },
        apkIdentity: validIdentity,
        signerDigest: RELEASE_CERT_SHA256,
      }),
    /no coinciden/,
  );
  assert.throws(
    () =>
      validateReleaseIdentity({
        packageVersion: "1.3.6",
        gradleVersion: { versionCode: 14, versionName: "1.3.6" },
        apkIdentity: validIdentity,
        signerDigest: "0".repeat(64),
      }),
    /certificado oficial/,
  );
});
