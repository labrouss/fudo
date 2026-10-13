// Absolute paths of the bundled report assets (this package stays outside the app bundles).
const path = require("path");
module.exports = {
  regular: path.join(__dirname, "DejaVuSans.ttf"),
  bold: path.join(__dirname, "DejaVuSans-Bold.ttf"),
  mark: path.join(__dirname, "fudo-mark.png"),
};
