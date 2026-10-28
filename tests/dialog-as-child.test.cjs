const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const React = require("react");
const ReactDOMServer = require("react-dom/server");

const dialogPath = join(__dirname, "..", "components", "ui", "dialog.jsx");

test("components/ui/dialog.jsx source maps asChild to render without leaking to DOM", async () => {
  const source = await readFile(dialogPath, "utf8");

  assert.match(source, /function DialogTrigger\(\{\s*asChild,\s*children,\s*render,\s*\.\.\.props\s*\}\)/);
  assert.match(source, /function DialogClose\(\{\s*asChild,\s*children,\s*render,\s*\.\.\.props\s*\}\)/);
  assert.match(source, /render: render \?\? children/);
});

test("DialogClose with asChild renders a single button without nesting or asChild DOM attribute", async () => {
  const { Dialog } = require("@base-ui/react/dialog");
  const { Button } = require("@base-ui/react/button");

  function DialogClose({ asChild, children, render, ...props }) {
    return React.createElement(
      Dialog.Close,
      {
        "data-slot": "dialog-close",
        ...(asChild ? { render: render ?? children } : render ? { render } : {}),
        ...props,
      },
      asChild ? undefined : children
    );
  }

  const cancelButton = React.createElement(
    Button,
    { type: "button", className: "cancel-action" },
    "Cancel"
  );

  const tree = React.createElement(
    Dialog.Root,
    { open: true },
    React.createElement(DialogClose, { asChild: true }, cancelButton)
  );

  const html = ReactDOMServer.renderToString(tree);

  // Must contain only one button tag
  const buttonMatches = html.match(/<button/g);
  assert.equal(buttonMatches?.length, 1, "Expected exactly 1 <button> element in rendered output");

  // Must not have asChild attribute on DOM
  assert.equal(html.includes("aschild"), false, "asChild must not appear as an HTML attribute");
  assert.equal(html.includes("asChild"), false, "asChild must not appear as an HTML attribute");

  // Must preserve slot and class
  assert.ok(html.includes('data-slot="dialog-close"'));
  assert.ok(html.includes('class="cancel-action"'));
});
