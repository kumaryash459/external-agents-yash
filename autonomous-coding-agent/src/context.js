import { readdir, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { extname, join, relative } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ignored = new Set([".git", "node_modules", ".entire", "dist", "build", ".next", "coverage"]);

async function walk(root, current = root, files = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = join(current, entry.name);
    if (entry.isDirectory()) await walk(root, full, files);
    else files.push(relative(root, full));
  }
  return files;
}

async function git(repository, args) {
  try {
    const { stdout } = await execFile("git", args, { cwd: repository, windowsHide: true, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

function parsePackage(document) {
  try {
    const pkg = JSON.parse(document);
    return { dependencies: { ...pkg.dependencies, ...pkg.devDependencies }, validationCommands: pkg.scripts?.test ? [["npm", "test"]] : [], projectType: "node" };
  } catch {
    return { dependencies: {}, validationCommands: [], projectType: "unknown" };
  }
}

export async function scanRepository(repository) {
  let files;
  try { files = await walk(repository); } catch (error) { if (error.code === "ENOENT") files = []; else throw error; }
  const documents = {};
  for (const name of ["README.md", "package.json", "requirements.txt", "pyproject.toml"]) {
    if (files.includes(name)) documents[name] = (await readFile(join(repository, name), "utf8")).slice(0, 8000);
  }
  const packageInfo = documents["package.json"] ? parsePackage(documents["package.json"]) : { dependencies: {}, validationCommands: [], projectType: files.length ? "unknown" : "new" };
  if (documents["pyproject.toml"] || documents["requirements.txt"]) {
    packageInfo.projectType = packageInfo.projectType === "node" ? "polyglot" : "python";
    if (files.includes("pyproject.toml")) packageInfo.validationCommands.push(["python", "-m", "pytest"]);
  }
  const filesByExtension = Object.fromEntries(files.reduce((counts, file) => {
    const extension = extname(file).toLowerCase() || "[no extension]";
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
    return counts;
  }, new Map()));
  const gitContext = {
    branch: await git(repository, ["branch", "--show-current"]),
    recentCommits: (await git(repository, ["log", "-5", "--pretty=format:%h %s"]))?.split("\n") ?? [],
    workingTree: (await git(repository, ["status", "--short"]))?.split("\n").filter(Boolean) ?? []
  };
  return {
    repository, files, documents, testFiles: files.filter((f) => /(^|[\\/])test[^/\\]*\.|\.test\.|_test\./i.test(f)),
    architecture: { projectType: packageInfo.projectType, filesByExtension }, dependencies: packageInfo.dependencies,
    validationCommands: packageInfo.validationCommands, git: gitContext
  };
}
