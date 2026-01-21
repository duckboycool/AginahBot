const { dbExecute, getModeratorRole } = require('../lib');

const ALERT_CUTOFF = 900;

// Ping mods to add to thread and alert if approaching member cap
module.exports = async (client, addedMembers, removedMembers) => {
  const newMember = addedMembers.first();

  // Exit if there's no new members, or thread member count is below cap
  if (!newMember) {
    return;
  }
  
  const thread = newMember.thread;
  if (thread.memberCount <= ALERT_CUTOFF) {
    return;
  }

  // Try to mark thread as alerted, or exit if it's already marked
  try {
    await dbExecute('INSERT INTO alerted_threads (threadId) VALUES (?)', [thread.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      // Thread is already alerted
      return;
    } else {
      console.log(err);
      return;
    }
  }

  const moderator = await getModeratorRole(thread.guild);
  await thread.send(`Adding ${moderator}s to this thread as it is approaching the member cap.`);
};
