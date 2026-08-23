import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ANDROID_PACKAGE_NAME = "com.mhl.music";
export const RELEASE_CERT_SHA256 =
  "45f630a6f9c32b65333b0b894004eda09d7b60f96118ad9e79d2e6435bfe383b";

export function parseAndroidVersion(buildGradle) {
  const versionCodeMatch = buildGradle.match(/^\s*versionCode\s+(\d+)\s*$/m);
  const versionNameMatch = buildGradle.match(/^\s*versionName\s+["']([^"']+)["']\s*$/m);

  if (!versionCodeMatch || !versionNameMatch) {
    throw new Error("No se pudo leer versionCode/versionName de android/app/build.gradle.");
  }

  return {
    versionCode: Number(versionCodeMatch[1]),
    versionName: versionNameMatch[1],
  };
}

export function parseDesktopVersion(bridgeSource) {
  const constMatch = bridgeSource.match(/^\s*APP_VERSION\s*=\s*['"]([^'"]+)['"]/m);
  if (constMatch) {
    return constMatch[1];
  }
  const versionMatch = bridgeSource.match(
    /['"]User-Agent['"]\s*:\s*['"]MHLMusic\/([^'"]+)['"]/,
  );
  if (!versionMatch) {
    throw new Error("No se pudo leer la versión Desktop de mhl-desktop/bridge.py.");
  }
  return versionMatch[1];
}

export function parseAaptIdentity(output) {
  const packageLine = output.split(/\r?\n/, 1)[0] ?? "";
  const packageName = packageLine.match(/\bname='([^']+)'/)?.[1];
  const versionCode = packageLine.match(/\bversionCode='(\d+)'/)?.[1];
  const versionName = packageLine.match(/\bversionName='([^']+)'/)?.[1];

  if (!packageName || !versionCode || !versionName) {
    throw new Error("aapt no devolvió una identidad Android válida.");
  }

  return {
    packageName,
    versionCode: Number(versionCode),
    versionName,
  };
}

export function parseSignerDigest(output) {
  const digest = output.match(/Signer #1 certificate SHA-256 digest:\s*([0-9a-f:]+)/i)?.[1];
  if (!digest) {
    throw new Error("apksigner no devolvió el SHA-256 del certificado.");
  }
  return digest.replaceAll(":", "").toLowerCase();
}

export function createUpdateManifest({ versionCode, versionName }) {
  return {
    schemaVersion: 1,
    packageName: ANDROID_PACKAGE_NAME,
    versionName,
    versionCode,
    apkAssetName: `MHL-Music-${versionName}.apk`,
  };
}

export function validateReleaseIdentity({
  packageVersion,
  gradleVersion,
  desktopVersion,
  apkIdentity,
  signerDigest,
}) {
  if (packageVersion !== gradleVersion.versionName) {
    throw new Error(
      `package.json (${packageVersion}) y Android (${gradleVersion.versionName}) no coinciden.`,
    );
  }
  if (packageVersion !== desktopVersion) {
    throw new Error(
      `package.json (${packageVersion}) y Desktop (${desktopVersion}) no coinciden.`,
    );
  }
  if (
    apkIdentity.packageName !== ANDROID_PACKAGE_NAME ||
    apkIdentity.versionCode !== gradleVersion.versionCode ||
    apkIdentity.versionName !== gradleVersion.versionName
  ) {
    throw new Error("La identidad interna del APK no coincide con la configuración Android.");
  }
  if (signerDigest.toLowerCase() !== RELEASE_CERT_SHA256) {
    throw new Error("El APK no está firmado con el certificado oficial de MHL Music.");
  }
}

function findLatestBuildTools(repoRoot) {
  const buildToolsRoot = path.join(repoRoot, ".tools", "android-sdk", "build-tools");
  const versions = existsSync(buildToolsRoot)
    ? readFileSystemDirectories(buildToolsRoot).sort(compareVersions).reverse()
    : [];
  if (versions.length === 0) {
    throw new Error("No se encontraron Android build-tools en .tools/android-sdk.");
  }
  return path.join(buildToolsRoot, versions[0]);
}

function readFileSystemDirectories(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function compareVersions(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function resolveTool(buildTools, name) {
  const extension = process.platform === "win32" ? ".exe" : "";
  const toolPath = path.join(buildTools, `${name}${extension}`);
  if (!existsSync(toolPath)) {
    throw new Error(`No se encontró ${name} en ${buildTools}.`);
  }
  return toolPath;
}

function findJavaExecutable(repoRoot) {
  const jdkRoot = path.join(repoRoot, ".tools", "jdk");
  const executableName = process.platform === "win32" ? "java.exe" : "java";
  const candidates = [
    path.join(jdkRoot, "bin", executableName),
    ...readFileSystemDirectories(jdkRoot).map((directory) =>
      path.join(jdkRoot, directory, "bin", executableName),
    ),
  ];
  const javaExecutable = candidates.find(existsSync);
  if (!javaExecutable) {
    throw new Error("No se encontró Java en .tools/jdk.");
  }
  return javaExecutable;
}

export function prepareAndroidRelease({
  repoRoot,
  apkPath,
  outputDirectory = path.join(repoRoot, "release"),
}) {
  const absoluteApkPath = path.resolve(repoRoot, apkPath);
  if (!existsSync(absoluteApkPath)) {
    throw new Error(`No existe el APK: ${absoluteApkPath}`);
  }

  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const gradleVersion = parseAndroidVersion(
    readFileSync(path.join(repoRoot, "android", "app", "build.gradle"), "utf8"),
  );
  const desktopVersion = parseDesktopVersion(
    readFileSync(path.join(repoRoot, "mhl-desktop", "bridge.py"), "utf8"),
  );
  const buildTools = findLatestBuildTools(repoRoot);
  const javaExecutable = findJavaExecutable(repoRoot);

  const aaptOutput = execFileSync(
    resolveTool(buildTools, "aapt"),
    ["dump", "badging", absoluteApkPath],
    { encoding: "utf8" },
  );
  const apksignerJar = path.join(buildTools, "lib", "apksigner.jar");
  if (!existsSync(apksignerJar)) {
    throw new Error(`No se encontró apksigner.jar en ${buildTools}.`);
  }
  const signerOutput = execFileSync(
    javaExecutable,
    ["-jar", apksignerJar, "verify", "--print-certs", absoluteApkPath],
    { encoding: "utf8" },
  );
  const apkIdentity = parseAaptIdentity(aaptOutput);
  const signerDigest = parseSignerDigest(signerOutput);

  validateReleaseIdentity({
    packageVersion: packageJson.version,
    gradleVersion,
    desktopVersion,
    apkIdentity,
    signerDigest,
  });

  const manifest = createUpdateManifest(gradleVersion);
  mkdirSync(outputDirectory, { recursive: true });
  const destinationApk = path.join(outputDirectory, manifest.apkAssetName);
  if (path.resolve(destinationApk) !== absoluteApkPath) {
    copyFileSync(absoluteApkPath, destinationApk);
  }
  const manifestPath = path.join(outputDirectory, "MHL-Music-Android.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    apkPath: destinationApk,
    manifestPath,
    apkSha256: sha256File(destinationApk),
    signerSha256: signerDigest,
    manifest,
  };
}

function parseArguments(argv) {
  const apkIndex = argv.indexOf("--apk");
  const outputIndex = argv.indexOf("--output-dir");
  return {
    apkPath:
      apkIndex >= 0
        ? argv[apkIndex + 1]
        : path.join("android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
    outputDirectory: outputIndex >= 0 ? argv[outputIndex + 1] : "release",
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  try {
    const repoRoot = path.resolve(path.dirname(currentFile), "..", "..");
    const arguments_ = parseArguments(process.argv.slice(2));
    const result = prepareAndroidRelease({
      repoRoot,
      apkPath: arguments_.apkPath,
      outputDirectory: path.resolve(repoRoot, arguments_.outputDirectory),
    });
    console.log(`APK: ${result.apkPath}`);
    console.log(`Manifest: ${result.manifestPath}`);
    console.log(`APK SHA-256: ${result.apkSha256}`);
    console.log(`Certificado SHA-256: ${result.signerSha256}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
