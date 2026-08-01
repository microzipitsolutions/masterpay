export function validateSignupForm(form) {
  if (!form.name.trim() || !form.username.trim() || !form.password) {
    return "Please fill in all fields.";
  }
  if (form.password.length < 6) {
    return "Password must be at least 6 characters.";
  }
  if (form.password !== form.confirmPassword) {
    return "Passwords do not match.";
  }
  return "";
}
