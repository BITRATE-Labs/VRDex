/** Project only exact validated labels from the already-budgeted authority response. */
export function membershipRoleObservations(roles) {
  if (!Array.isArray(roles) || roles.length > 100) return [];
  const seen = new Set();
  return roles.flatMap(role => {
    if (!role || typeof role.id !== "string" || !/^grol_[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(role.id) ||
        typeof role.name !== "string" || !role.name.trim() || role.name.length > 200 || /[\u0000-\u001f\u007f]/u.test(role.name)) return [];
    const roleId = role.id.toLowerCase();
    if (seen.has(roleId)) return [];
    seen.add(roleId);
    return [{ roleId, name: role.name.trim() }];
  });
}
