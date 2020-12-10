import Debug from "debug";

export const debugCli = Debug("cli");

export const debugNet = debugCli.extend("net");
export const debugCache = debugCli.extend("cache");
export const debugExtract = debugCli.extend("extract");
export const debugDownload = debugCli.extend("download");
