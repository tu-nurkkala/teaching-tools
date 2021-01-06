child_process = require("child_process");

let result = child_process.spawnSync("more", ["../../db.json"], {
  stdio: "inherit",
});
console.log(result);
