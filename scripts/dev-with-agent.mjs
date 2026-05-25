import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const apiUrl = process.env.LANGGRAPH_API_URL ?? "http://127.0.0.1:2024";
const docsUrl = `${apiUrl.replace(/\/$/, "")}/docs`;
const viteArgs = process.argv.slice(2);
const isWindows = process.platform === "win32";

let langgraphProcess;
let viteProcess;
let shuttingDown = false;

function commandExists(commandPath) {
  return existsSync(commandPath);
}

function langgraphCommand() {
  const relative = isWindows
    ? [".venv", "Scripts", "langgraph.exe"]
    : [".venv", "bin", "langgraph"];
  const command = path.join(root, ...relative);

  if (!commandExists(command)) {
    throw new Error(
      `Missing LangGraph executable at ${command}. Install Python dependencies with ".\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt".`,
    );
  }

  return command;
}

async function isAgentReady() {
  try {
    const response = await fetch(docsUrl, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForAgent() {
  const startedAt = Date.now();
  const timeoutMs = 60000;

  while (Date.now() - startedAt < timeoutMs) {
    if (await isAgentReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`LangGraph did not become ready at ${apiUrl} within 60 seconds.`);
}

function spawnLangGraph() {
  console.log(`[dev] Starting LangGraph at ${apiUrl}`);
  langgraphProcess = spawn(langgraphCommand(), ["dev", "--no-browser", "--allow-blocking"], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
    stdio: "inherit",
    windowsHide: false,
  });

  langgraphProcess.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] LangGraph exited with code ${code ?? "null"} signal ${signal ?? "null"}.`);
    shutdown(code ?? 1);
  });
}

function spawnVite() {
  const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");

  console.log("[dev] Starting Vite");
  viteProcess = spawn(process.execPath, [viteCli, "dev", ...viteArgs], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: false,
  });

  viteProcess.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shutdown(code ?? (signal ? 1 : 0));
  });
}

function killTree(child) {
  if (!child || child.killed) return;

  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  killTree(viteProcess);
  killTree(langgraphProcess);
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  if (await isAgentReady()) {
    console.log(`[dev] LangGraph already available at ${apiUrl}`);
  } else {
    spawnLangGraph();
    await waitForAgent();
  }

  spawnVite();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
