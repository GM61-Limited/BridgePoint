// GM61 Autobridge Version 3.0001
// ETL script for extracting washer data from a folder on site and sending it via an API
/*
This script monitors a specified folder for new XML files representing washer data.
When a new file is detected, it uploads the file to a remote API with authentication.

Built in May 2025 by Nick LeMasonry, Head of Software & Data at GM61 Limited.

RELEASE NOTES:
- Version 2.0008: Added support for removing hashtags in serial numbers if configured.
- Version 2.0007: Upgraded logging archive functionality to zip logs older than 7 days and remove them.
- Version 2.0006: Added functionalitiy to retry failed uploads up to x times with exponential backoff, configured within ENV.
- Version 2.0005: Added support for removing spaces in serial numbers if configured.
- Version 2.0004: Added support for authentication token caching and expiry handling.
- Version 2.0003: Upgraded logging functionality to track file processing and errors.


*/
// Command to start the script (testing): deno run --allow-read --allow-net --allow-env --allow-write --allow-run --unstable-kv AutoBridge.ts
/*
Compile on MAC: 
deno compile --allow-read --allow-net --allow-env --allow-write --unstable-kv --allow-run --output washer-uploader AutoBridge.ts
Command to compile on Windows:
deno compile --allow-read --allow-net --allow-env --allow-write --unstable-kv --target x86_64-pc-windows-msvc --allow-run --no-check --output GM61-AutoBridge.exe AutoBridge.ts

*/

import { ensureDir, exists } from "https://deno.land/std/fs/mod.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const startDateStr = Deno.env.get("START_DATE"); // e.g. "2025-06-01"
const startDate = startDateStr ? new Date(startDateStr) : null;

const removeSpaces = Deno.env.get("REMOVE_SPACES")?.toLowerCase() === "true";
const removeHashtags = Deno.env.get("REMOVE_HASHTAGS")?.toLowerCase() === "true";

const maxRetries = parseInt(Deno.env.get("MAX_RETRIES") || "5");

const useSubfolder = Deno.env.get("SUBFOLDER")?.toLowerCase() === "true";
const isEndo = !useSubfolder;

const xmlTag = Deno.env.get("XML_TAG") || "MACHNAME";
const pollInterval = parseInt(Deno.env.get("POLL_INTERVAL") || "10") * 1000;

const moveFile = Deno.env.get("MOVE_FILE")?.toLowerCase() === "true";
const moveFilePath = Deno.env.get("MOVE_FILE_PATH") || "";

// Ensure logs directory exists
await ensureDir("logs");

// Retrieve authentication details from environment variables
const authUrl = Deno.env.get("AUTH_URL")!;
const authUsername = Deno.env.get("AUTH_USERNAME")!;
const authPassword = Deno.env.get("AUTH_PASSWORD")!;

// Variables to cache the authentication token and its expiry time
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

/**
 * Writes a log message to a daily log file (one per day).
 * Cleans up log files older than 7 days.
 * @param message The message to log.
 */
async function writeLog(message: string) {
  try {
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const dailyLogPath = join("logs", `log_${dateStr}.log`);
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    await Deno.writeTextFile(dailyLogPath, logMessage, { append: true });

    // Clean up old log files (keep last 7 days)
    for await (const entry of Deno.readDir("logs")) {
      if (entry.isFile && entry.name.startsWith("log_") && entry.name.endsWith(".zip")) {
        const logDateStr = entry.name.slice(4, 14); // extract date
        const logDate = new Date(logDateStr);
        const daysOld = (Date.now() - logDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld > 7) {
          await Deno.remove(join("logs", entry.name));
          await writeLog(`Deleted old zipped log: ${entry.name}`);
        }
      }
    }

    // Zip yesterday's log file if it exists and hasn't been zipped
    const yesterday = new Date(Date.now() - 86400000); // 24 * 60 * 60 * 1000
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const yesterdayLog = join("logs", `log_${yesterdayStr}.log`);
    const zipPath = `${yesterdayLog}.zip`;

    try {
      const fileInfo = await Deno.stat(yesterdayLog);
      if (fileInfo && !await exists(zipPath)) {
        const zipCommand = new Deno.Command("zip", {
          args: ["-j", zipPath, yesterdayLog],
          stdout: "null",
          stderr: "null",
        });
        await zipCommand.output();
        await Deno.remove(yesterdayLog);
        await writeLog(`Zipped: ${yesterdayLog}`);
      }
    } catch (_) {
      // No action if file doesn't exist
    }
  } catch (err) {
    console.error("Logging failed:", err);
  }
}

// Folder path to watch for new files, specified via environment variable
const folderPath = Deno.env.get("WATCH_FOLDER")!;

// Open or create a SQLite-style key-value store for tracking processed files
const db = await Deno.openKv(join("logs", "processed_files.db"));

/**
 * Sends a file to the remote API with appropriate authentication and metadata.
 * @param filepath The full path to the file to send.
 * @param subfolder The subfolder name, representing machine serial or washer identifier.
 * @returns A boolean indicating success or failure of the upload.
 */
async function sendFile(filepath: string, subfolder: string | null) {
  try {
    const fileContent = await Deno.readFile(filepath);
    const filename = filepath.split(/[\\/]/).pop() || filepath;
    const machineCode = Deno.env.get("MACHINE_CODE")!;
    let serialValue = subfolder;

    if (!useSubfolder) {
      const xmlText = await Deno.readTextFile(filepath);
      const machMatch = xmlText.match(new RegExp(`<${xmlTag}>(.*?)</${xmlTag}>`, "i"));
      if (machMatch && machMatch[1]) {
        serialValue = machMatch[1].trim();
      } else {
        await writeLog(`${xmlTag} not found in ${filepath}`);
        serialValue = "UNKNOWN";
      }
    }

    if (serialValue === null) {
      serialValue = "";
    }

    if (removeSpaces) serialValue = serialValue.replace(/\s+/g, "");
    if (removeHashtags) serialValue = serialValue.replace(/#/g, "");
    const combinedMachineCode = `${machineCode}-${serialValue}`;
    let attempt = 0;
    let success = false;

    while (attempt < maxRetries && !success) {
      attempt++;
      try {
        const formData = new FormData();
        formData.append("file", new Blob([fileContent]), filename);
        formData.append("machineCode", combinedMachineCode);
        formData.append("machineSerial", serialValue);

        await writeLog(`Attempt ${attempt}: Uploading file ${filename} with machineCode: ${combinedMachineCode}`);

        const now = Date.now();
        if (!cachedToken || !tokenExpiry || now >= tokenExpiry) {
          const authResponse = await fetch(authUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: authUsername, password: authPassword }),
          });

          if (!authResponse.ok) {
            await writeLog(`Auth failed: ${authResponse.status} ${authResponse.statusText}`);
            continue;
          }

          const authData = await authResponse.json();
          cachedToken = `Bearer ${authData.data.access_token}`;
          const decodedPayload = JSON.parse(atob(authData.data.access_token.split(".")[1]));
          tokenExpiry = decodedPayload.exp * 1000;
          await writeLog(`Auth successful. Token cached until ${new Date(tokenExpiry).toISOString()}`);
        }

        const response = await fetch(Deno.env.get("API_URL")!, {
          method: "POST",
          headers: {
            "authorization": cachedToken,
          },
          body: formData,
        });

        const contentType = response.headers.get("content-type");
        let responseBody: any;

        if (contentType && contentType.includes("application/json")) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        if (!response.ok) {
          await writeLog(`API Response: ${JSON.stringify({
            statusCode: response.status,
            message: responseBody.message || responseBody,
          })}`);
        } else {
          success = true;
        }
      } catch (err) {
        await writeLog(`Attempt ${attempt} failed with error: ${err}`);
      }

      if (!success && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // wait 2s before retrying
      }
    }

    const status = success ? "success" : "failed";
    await writeLog(`File ${filename} from ${subfolder} processed: ${status}`);
    // Move file if configured and upload was successful
    if (success && moveFile && moveFilePath) {
      try {
        const destinationPath = join(moveFilePath, filename);
        await ensureDir(moveFilePath);
        await Deno.rename(filepath, destinationPath);
        await writeLog(`Moved processed file ${filename} to ${destinationPath}`);
      } catch (moveErr) {
        await writeLog(`Failed to move file ${filename}: ${moveErr}`);
      }
    }
    await db.set(["processed_files", filename], {
      filename,
      subfolder,
      status,
      timestamp: new Date().toISOString(),
    });

    console.log(`File ${filename} from ${subfolder} processed: ${status}`);
    return success;
  } catch (error) {
    const filename = filepath.split(/[\\/]/).pop() || filepath;
    console.error(`Error processing ${filename} from ${subfolder}: ${error}`);
    await writeLog(`Error processing ${filename} from ${subfolder}: ${error}`);
    await db.set(["processed_files", filename], {
      filename,
      subfolder,
      status: "error",
      timestamp: new Date().toISOString(),
    });
    return false;
  }
}

/**
 * Continuously monitors the designated folder for new washer subfolders and XML files.
 * Processes any new files found by uploading them via the sendFile function.
 */
async function processFolder() {
  // Ensure the main folder to watch exists
  await ensureDir(folderPath);

  // Infinite loop to keep watching the folder for changes
  while (true) {
    // Iterate over each subfolder (washer folder) in the main folder
    for await (const washerFolder of Deno.readDir(folderPath)) {
      if (useSubfolder && washerFolder.isDirectory) {
        const washerPath = join(folderPath, washerFolder.name);

        for await (const entry of Deno.readDir(washerPath)) {
          if (entry.isFile && entry.name.toLowerCase().endsWith(".xml")) {
            const fullPath = join(washerPath, entry.name);
            const fileInfo = await Deno.stat(fullPath);
            const fileCreatedDate = fileInfo.birthtime ?? fileInfo.mtime;
            if (startDate && fileCreatedDate && fileCreatedDate < startDate) continue;

            const filename = entry.name;
            const existing = await db.get(["processed_files", filename]);
            if (!existing.value) {
              await writeLog(`Found new file: ${filename} in ${washerFolder.name}`);
              await sendFile(fullPath, washerFolder.name);
            }
          }
        }
      } else if (!useSubfolder && washerFolder.isFile && washerFolder.name.toLowerCase().endsWith(".xml")) {
        const fullPath = join(folderPath, washerFolder.name);
        const fileInfo = await Deno.stat(fullPath);
        const fileCreatedDate = fileInfo.birthtime ?? fileInfo.mtime;
        if (startDate && fileCreatedDate && fileCreatedDate < startDate) continue;

        const filename = washerFolder.name;
        const existing = await db.get(["processed_files", filename]);
        if (!existing.value) {
          await writeLog(`Found new file: ${filename} in root folder`);
          await sendFile(fullPath, null);
        }
      }
    }

    // Wait for pollInterval milliseconds before checking the folder again to reduce CPU usage
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

// Start the folder processing loop
await processFolder();

// Gracefully close the key-value store when the script is exiting
addEventListener("unload", () => {
  db.close();
});