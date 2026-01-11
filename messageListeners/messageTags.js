const { dbQueryOne } = require('../lib');
const msCooldown = 10_000; // Per tag, and per channel

module.exports = async (client, message) => {
  // Preprocess string to remove code blocks
  // This detection is definitely not perfect, but hopefully it'll be enough to suffice in practice
  // If not, the best option would probably be to bring in a discord markdown parsing lib
  const searchContent = message.content.replaceAll(/(?<!\\)(?:(`{1,2}).*?[^`]\1(?!`)|```.+?```)/gs, '');
  // Extract and deduplicate tags present
  const messageTags = new Set(searchContent.match(/(?<=\B&)\w+/g));

  // If there are no tags in this message, do nothing
  if (messageTags.size === 0) { return; }

  // Send each tag message to the channel in a separate message, in order of message
  for (let tag of messageTags) {
    // Fetch the tag message from the database
    let sql = `SELECT mt.id, mt.tagContent
               FROM message_tags mt
               JOIN guild_data gd ON mt.guildDataId = gd.id
               WHERE gd.guildId=?
                  AND mt.tagName=?`;
    const row = await dbQueryOne(sql, [message.guild.id, tag]);

    console.debug(`Recognized ${tag}, found is ${row != null}`);
    if (row != null) {
      const lastTimestamp = client.lastTagUse.get(`${row.id};${message.channelId}`);
      if (lastTimestamp == null || message.createdTimestamp > lastTimestamp + msCooldown) {
        await message.channel.send(row.tagContent);
        client.lastTagUse.set(`${row.id};${message.channelId}`, message.createdTimestamp);
      } else {
        console.debug("Hit cooldown");
      }
    }
  }
};