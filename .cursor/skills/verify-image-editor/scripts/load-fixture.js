// Load a generated PNG into the editor through the "Choose image" file input.
//
// Paste this whole file as the `expression` of a browser_cdp Runtime.evaluate
// call with { awaitPromise: true, returnByValue: true }. Edit the last line to
// change the fixture size (800x600 is quick; 4000x3000 is the large-image check
// required by openspec/config.yaml).
//
// Why this path: the Cursor browser cannot open the OS file dialog, so the PNG is
// generated in-page (same pixels as test/manual/large-image-fixture.html) and
// handed to #fileInput through a DataTransfer, then `change` fires exactly as it
// does after a user picks a file. Everything after that is the real app path.
(async (width, height) => {
  const fixture = document.createElement("canvas");
  fixture.width = width;
  fixture.height = height;
  const context = fixture.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#e63946");
  gradient.addColorStop(0.5, "#f1fa8c");
  gradient.addColorStop(1, "#457b9d");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(0, 0, 0, 0.35)";
  context.lineWidth = Math.max(2, width / 500);
  const step = Math.max(50, Math.round(width / 16));
  for (let x = 0; x <= width; x += step) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += step) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.fillStyle = "#111";
  context.font = `bold ${Math.round(height / 18)}px system-ui`;
  context.fillText(`${width} \u00d7 ${height}`, width * 0.04, height * 0.09);

  const blob = await new Promise((resolve) => fixture.toBlob(resolve, "image/png"));
  const file = new File([blob], `verify-fixture-${width}x${height}.png`, {
    type: "image/png",
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const input = document.getElementById("fileInput");
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));

  const status = document.getElementById("appStatus");
  const deadline = performance.now() + 20000;
  while (performance.now() < deadline) {
    if (/ready to edit/.test(status.textContent) || status.dataset.error === "true") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const canvas = document.getElementById("imageProcessed");
  return {
    status: status.textContent,
    statusError: status.dataset.error,
    fileName: file.name,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    controlsEnabled: !document.getElementById("controls").disabled,
  };
})(800, 600);
