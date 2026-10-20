const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const { dbQueryOne, dbQueryAll, updateCategoryMessage } = require('../lib');

console.debug('Logging into Discord...');
const client = new Client({
  partials: [ Partials.GuildMember, Partials.Message, Partials.Reaction ],
  intents: [ GatewayIntentBits.Guilds ],
});
client.login(config.token).then(async () => {
  console.debug('Connected.');
  console.debug(`This bot has been installed in ${client.guilds.cache.size} guilds.\n`);
  const sql = `SELECT rc.messageId, rc.categoryName
               FROM role_categories rc
               JOIN role_systems rs ON rc.roleSystemId = rs.id
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE gd.guildId=?`;
  for (let guild of Array.from(client.guilds.cache.values())){
    try {
      console.log(`\nWorking on guild: ${guild.name}`);
      let categories = await dbQueryAll(sql, [guild.id]);
      for (let category of categories) {
        try {
          console.log(`Updating category: ${category.categoryName}`);
          await updateCategoryMessage(client, guild, category.messageId);
        } catch (e) {
          console.error(e);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  client.destroy();
});
