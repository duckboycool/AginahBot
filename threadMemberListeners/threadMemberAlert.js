const { dbExecute, dbQueryOne, getModRole, getLeadModRole } = require('../lib');

const ALERT_CUTOFF = 900;

// Ping mods to add to thread and alert if approaching member cap
module.exports = async (client, addedMembers, removedMembers) => {
  const newMember = addedMembers.first();

  // Exit if there's no new members besides the bot, or thread member count is below cap
  if (!newMember || (newMember.id === client.user.id && addedMembers.size === 1)) {
    return;
  }

  const thread = newMember.thread;
  // Skip locked threads, and maybe it's good to not mark them so they could alert if they get unlocked?
  if (thread.memberCount <= ALERT_CUTOFF || thread.locked) {
    return;
  }

  // Mark thread as alerted, or exit if it's already marked
  const alerted = await dbQueryOne('SELECT id FROM alerted_threads WHERE threadId=?', [thread.id]);
  if (alerted) {
    return;
  }

  await dbExecute('INSERT INTO alerted_threads (threadId) VALUES (?)', [thread.id]);

  const moderator = await getModRole(thread.guild) ?? await getLeadModRole(thread.guild);
  await thread.send(`Adding ${moderator}s to this thread as it is approaching the member cap.`);
};
