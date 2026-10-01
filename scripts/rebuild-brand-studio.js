#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const studio = path.join(root, "studio-v2");
const destDir = path.join(root, "사이트만들기-브랜드");
const outName = "dist-build-new";
const pkgPath = path.join(studio, "package.json");

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

const pkgRaw = fs.readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgRaw);
const prevOutput = pkg.build?.directories?.output || "dist-out";
pkg.build.directories.output = outName;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

try {
  rmDir(path.join(studio, outName));
  const r = spawnSync("npm", ["run", "dist"], { cwd: studio, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status || 1);

  function findExe(dir) {
    if (!fs.existsSync(dir)) return null;
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, name.name);
      if (name.isDirectory()) {
        const hit = findExe(p);
        if (hit) return hit;
      } else if (name.name === "InfocsBrandStudio.exe") return p;
    }
    return null;
  }

  const exe = findExe(path.join(studio, outName));
  if (!exe) {
    console.error("InfocsBrandStudio.exe not found under studio-v2/" + outName);
    process.exit(1);
  }
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "InfocsBrandStudio.exe");
  const destAlt = path.join(destDir, "InfocsBrandStudio-new.exe");
  try {
    fs.copyFileSync(exe, dest);
    console.log("OK ->", dest);
  } catch (err) {
    if (err && err.code === "EBUSY") {
      fs.copyFileSync(exe, destAlt);
      console.log("OK (기존 exe 사용 중) ->", destAlt);
      console.log("Studio 종료 후 InfocsBrandStudio-new.exe 를 InfocsBrandStudio.exe 로 바꿔 쓰세요.");
    } else {
      throw err;
    }
  }
} finally {
  pkg.build.directories.output = prevOutput;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}
