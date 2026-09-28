export function validateInitialDoctorProfile(formData) {
  const requiredText = (field) => {
    const value = formData.get(field);
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("All professional and location fields are required");
    }
    return value.trim();
  };

  const specialty = requiredText("specialty");
  const experienceValue = requiredText("experience");
  if (!/^\d+$/.test(experienceValue)) {
    throw new Error("Experience must be a whole number between 1 and 70");
  }
  const experience = Number(experienceValue);
  if (!Number.isSafeInteger(experience) || experience < 1 || experience > 70) {
    throw new Error("Experience must be a whole number between 1 and 70");
  }

  const credentialUrl = requiredText("credentialUrl");
  let credential;
  try {
    credential = new URL(credentialUrl);
  } catch {
    throw new Error("Enter a valid credential URL");
  }
  if (!["http:", "https:"].includes(credential.protocol)) {
    throw new Error("Enter a valid credential URL");
  }

  const description = requiredText("description");
  if (description.length < 20 || description.length > 1000) {
    throw new Error("Description must be between 20 and 1000 characters");
  }

  const city = requiredText("city");
  const state = requiredText("state");
  const country = requiredText("country");
  for (const [label, value] of [["City", city], ["State or region", state], ["Country", country]]) {
    if (value.length < 2 || value.length > 100) {
      throw new Error(`${label} must be between 2 and 100 characters`);
    }
  }

  return { specialty, experience, credentialUrl, description, city, state, country };
}
