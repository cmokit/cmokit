// The message templates the lifecycle Worker is deployed with, by name. Add a template here when a
// sequence in cmokit.config.ts names it; the build fails if one is missing.
import welcome from './welcome.md';
import followUp from './follow-up.md';

export default { welcome, 'follow-up': followUp };
