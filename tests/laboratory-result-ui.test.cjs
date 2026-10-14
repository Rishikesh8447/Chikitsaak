const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const patientPagePromise = readFile(join(cwd(), "app", "(main)", "laboratory", "page.jsx"), "utf8");
const workspacePagePromise = readFile(join(cwd(), "app", "(main)", "laboratory", "workspace", "page.jsx"), "utf8");
const actionsPromise = readFile(join(cwd(), "actions", "laboratory.js"), "utf8");
const formsPromise = readFile(join(cwd(), "components", "laboratory-forms.jsx"), "utf8");
const adminPanelPromise = readFile(join(cwd(), "app", "(main)", "admin", "_components", "laboratory-panel.jsx"), "utf8");
const doctorPagePromise = readFile(join(cwd(), "app", "(main)", "doctor", "laboratory", "page.jsx"), "utf8");

test("patient result history is read from the authenticated patient's own orders and renders result text", async () => {
  const [page, actions] = await Promise.all([patientPagePromise, actionsPromise]);
  assert.match(actions, /export async function getMyLabOrders\(\)[\s\S]*?where: \{ patientId: patient\.id \}/);
  assert.match(page, /!order\.statusHistory\.length \? null : <details/);
  assert.match(page, /entry\.note\?\.startsWith\("Laboratory result: "\)/);
  assert.match(page, /entry\.note\.slice\("Laboratory result: "\.length\)/);
  assert.match(page, /entry\.note \? ` · \$\{entry\.note\}` : ""/);
  assert.match(page, /whitespace-pre-wrap/);
});

test("patient order history shows the total captured at booking once prices are assigned", async () => {
  const [page, actions] = await Promise.all([patientPagePromise, actionsPromise]);
  assert.match(actions, /items: \{ select: \{[^}]*priceAtBooking/);
  assert.match(page, /getLabOrderBookingTotalCents\(order\.items\)/);
  assert.match(page, /Total at booking: \{\(bookingTotalCents \/ 100\)\.toFixed\(2\)\}/);
});

test("patient must explicitly choose an eligible lab before confirming a doctor order", async () => {
  const forms = await formsPromise;
  const patientSelectionForm = forms.match(/export function PatientChooseLabForm\([\s\S]*?(?=\nexport function PatientRetryLabOrderForm)/)?.[0] || "";
  assert.match(patientSelectionForm, /useState\(""\)/);
  assert.match(patientSelectionForm, /<option value="" disabled>Select an eligible laboratory<\/option>/);
  assert.match(patientSelectionForm, /disabled=\{loading \|\| !selected\}/);
});

test("laboratory result form is limited to collected orders without a previously submitted result", async () => {
  const page = await workspacePagePromise;
  assert.match(page, /order\.status === "COLLECTED" && selected\.status === "VERIFIED"/);
  assert.match(page, /!order\.statusHistory\.some\(\(entry\) => entry\.note\?\.startsWith\("Laboratory result: "\)\)/);
  assert.match(page, /<LaboratoryResultForm laboratoryId=\{selected\.id\} orderId=\{order\.id\} \/>/);
});

test("laboratory rejection reason is clearly required only for rejection", async () => {
  const [forms, actions] = await Promise.all([formsPromise, actionsPromise]);
  assert.match(forms, /Reason for rejection \(required to reject\)/);
  assert.match(forms, /name="action" value="accept"/);
  assert.match(forms, /name="action" value="reject"/);
  assert.doesNotMatch(forms, /Rejection reason[^<]*<Input[^>]*required/);
  assert.match(actions, /action === "reject" \? "Rejection reason" : "Collection notes", 1000, action === "reject"/);
});

test("rejected laboratory owners can resubmit and land on the new pending application", async () => {
  const [workspace, forms] = await Promise.all([workspacePagePromise, formsPromise]);
  assert.match(workspace, /selected\.status === "REJECTED" && selected\.membershipRole === "OWNER"/);
  assert.match(workspace, /Resubmit laboratory application/);
  assert.match(workspace, /<LaboratoryApplicationForm resubmissionOfLaboratoryId=\{selected\.id\} \/>/);
  assert.match(forms, /name="resubmissionOfLaboratoryId" value=\{resubmissionOfLaboratoryId\}/);
  assert.match(forms, /router\.push\(`\/laboratory\/workspace\?laboratoryId=\$\{laboratoryId\}`\)/);
});

test("admin review form labels feedback as required for rejection", async () => {
  const panel = await adminPanelPromise;
  assert.match(panel, /Review reason \(required to reject\)/);
  assert.match(panel, /name="status" value=\{status\}/);
  assert.doesNotMatch(panel, /Review reason[^<]*<Input[^>]*required/);
});

test("rejected owner workspace presents review feedback and correction guidance", async () => {
  const workspace = await workspacePagePromise;
  assert.match(workspace, /selected\.status === "REJECTED" && selected\.statusReason/);
  assert.match(workspace, /Admin review feedback:/);
  assert.match(workspace, /No review feedback is recorded for this application\. Contact support before resubmitting\./);
});

test("ordering doctor can view only their own order history and submitted results", async () => {
  const [page, actions] = await Promise.all([doctorPagePromise, actionsPromise]);
  assert.match(actions, /export async function getDoctorLabOrders\(\)[\s\S]*?where: \{ doctorId: doctor\.id \}/);
  assert.match(actions, /Only doctors can view their laboratory orders/);
  assert.match(page, /getDoctorLabOrderOptions\(\), getDoctorLabOrders\(\)/);
  assert.match(page, /Orders and results/);
  assert.match(page, /entry\.note\?\.startsWith\("Laboratory result: "\)/);
  assert.match(page, /entry\.note\.slice\("Laboratory result: "\.length\)/);
});
