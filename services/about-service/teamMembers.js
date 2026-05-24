// Default team for GET /api/about (can override with TEAM_MEMBERS in .env)
const DEFAULT_TEAM = [
  {
    first_name: 'Itai',
    last_name: 'Kritmaler',
  },
];

// Return hardcoded team or parse TEAM_MEMBERS from environment
function getTeamMembers() {
  if (process.env.TEAM_MEMBERS) {
    try {
      const parsed = JSON.parse(process.env.TEAM_MEMBERS);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_TEAM;
}

module.exports = { getTeamMembers };
