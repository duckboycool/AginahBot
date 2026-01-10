const { dbQueryOne } = require('../lib');

module.exports = async (client, message) => {
  const matches = message.content.match(/&\w+\s?/g);

  // If there are no tags in this message, do nothing
  if (!matches) { return; }

  // Remove the & and trim tags, remove duplicates with a Set
  const messageTags = new Set();
  matches.forEach((tag) => {
    messageTags.add(tag.substring(1).trim());
  });
  
  // Send each tag message to the channel in a separate message, in order of message
  for (let tag of messageTags) {
    // Fetch the tag message from the database
    let sql = `SELECT mt.tagContent
               FROM message_tags mt
               JOIN guild_data gd ON mt.guildDataId = gd.id
               WHERE gd.guildId=?
                  AND mt.tagName=?`;
    const row = await dbQueryOne(sql, [message.guild.id, tag]);

    console.log(`Sending ${tag}...`);
    if (row != null) {
      await message.channel.send(row.tagContent);
    }
  }
};