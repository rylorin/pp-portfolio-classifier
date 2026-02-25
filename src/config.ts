import * as path from "path";

function addConfigPath(allPaths: string[], configPath: string) {
  //   console.debug(configPath);
  if (allPaths.indexOf(configPath) < 0) allPaths.push(configPath);
}

export function initConfig() {
  const allPaths: string[] = [];

  // Define config paths
  const package_path = path.join(path.dirname(require.resolve("../package.json")), "config");
  const runtime_path = path.normalize(path.join(process.cwd(), "config"));
  const file_path = path.join(path.dirname(process.argv[2]), "config");
  addConfigPath(allPaths, package_path);
  addConfigPath(allPaths, runtime_path);
  addConfigPath(allPaths, file_path);

  // Set NODE_CONFIG_DIR
  process.env["NODE_CONFIG_DIR"] = allPaths.join(path.delimiter);

  const _config = require("config");
  //   console.log(
  //     "Config dir:",
  //     process.env["NODE_ENV"],
  //     process.env["NODE_CONFIG_DIR"],
  //     config.util.getConfigSources().map((config: any) => config.name),
  //     config.get("version"),
  //   );
}

export default initConfig;
