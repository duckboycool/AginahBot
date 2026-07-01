const { MessageMentions, PermissionFlagsBits, messageLink } = require('discord.js');
const { dbQueryOne } = require('../lib.js');

const period = 10_000; // ms window for meeting threshold
const threshold = 10; // Number of points needed to activate

const spamPoints = (messageList) => {
  const channelIds = new Set(messageList.map((message) => message.channelId));
  
  // Add up number of attachments in a message in each channel, but cap at 2
  let attachmentPoints = 0;
  for (const channelId of channelIds) {
    const highest = Math.max(...messageList.filter((m) => m.channelId === channelId).map((m) => m.attachments.size));

    attachmentPoints += Math.min(highest, 2);
  };

  // Add constant extra points if any message tries to ping everyone/a role
  const pings = !!messageList.find((m) => m.content.search(MessageMentions.EveryonePattern) !== -1
    || m.content.search(MessageMentions.RolesPattern) !== -1);

  return channelIds.size + attachmentPoints + 2 * pings;
};

module.exports = async (client, message) => {
  // Ignore mod messages
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return;
  }

  let recent = client.recentMessages.get(message.author.id);
  if (recent == null) {
    client.recentMessages.set(message.author.id, [message]);
    return;
  }

  recent = recent.filter((old) => message.createdTimestamp < old.createdTimestamp + period);
  recent.push(message);

  const points = spamPoints(recent);
  if (points >= threshold) {
    console.debug(`Hit ${points} on user ${message.author.id}\nMessages:`);
    for (const message of recent) {
        console.debug(message);
    }
    //await message.member.timeout(60 * 60 * 1000, `Hit spam filter with ${recent.length} messages.`);

    // Have to delete messages one channel at a time
    const sent = new Set(recent.map((message) => message.channel));
    for (const channel of sent) {
      //await channel.bulkDelete(recent.filter((message) => message.channelId === channel.id));
    };

    client.recentMessages.delete(message.author.id);

    let sql = `SELECT go.id, go.alertsChannelId
               FROM guild_options go
               JOIN guild_data gd ON go.guildDataId = gd.id
               WHERE gd.guildId=?`;
    const options = await dbQueryOne(sql, [message.guild.id]);

    if (!options?.alertsChannelId) {
        console.debug('No alerts channel set, skipping');
        return;
    }
    const alertsChannel = await message.guild.channels.fetch(options.alertsChannelId);

    let content = `Found ${message.author} for spam detection. ` + 
      `Hit ${points} "spam points" in ${recent.length} messages (in ${period / 1000} seconds).\n\n` +
      'Would have deleted the following messages:';
    for (const message of recent) {
        content += `\n* ${messageLink(message.channelId, message.id, message.guildId)}`;
    }

    await alertsChannel.send({
      content: content
    });

    console.debug('Completed');
  } else {
    // Potential for data race here, but it probabaly won't matter much
    client.recentMessages.set(message.author.id, recent);
  }
};