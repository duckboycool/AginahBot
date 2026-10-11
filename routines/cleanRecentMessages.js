const { period } = require('../messageListeners/spamFilter.js');

module.exports = (client) => {
  const curTime = Date.now();
  const startLength = client.recentMessages.size;
  
  for (const [user, messages] of client.recentMessages.entries()) {
    const filtered = messages.filter((msg) => curTime < msg.createdTimestamp + period);
    if (filtered.length == 0) {
      client.recentMessages.delete(user);
    } else {
      client.recentMessages.set(user, filtered);
    }
  }

  console.log(`Cleared spam logs from ${startLength} users to ${client.recentMessages.size}`);
};
