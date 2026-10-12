const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const { dbExecute, dbQueryAll, dbQueryOne } = require('../lib');

module.exports = {
  category: 'APWorld Info Commands',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('apworld-info')
        .setDescription('Show the channel and link to releases for an APWorld in #apworld-index.')
        .addStringOption((opt) => opt
          .setName('world')
          .setDescription('Name of world')
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const search = interaction.options.getString('world', true);

        const sql = 'SELECT * FROM apworld_info WHERE worldName=?';
        const match = await dbQueryOne(sql, [search]);

        if (!match) {
          return interaction.reply({
            content: `Could not find world \`${search.replaceAll('`', '')}\` in playable list.`,
          });
        }

        return interaction.reply({
          content: `**${match.worldName} info**\n\nWorld channel: <#${match.channelId}>\nRelease link: <${match.releaseLink}>`,
        });
      },
      async autocomplete(interaction) {
        const curValue = interaction.options.getFocused();
        if (!curValue) {
          await interaction.respond([]);
          return;
        }

        // Probably a better way to perform this search
        const sql = `SELECT worldName FROM apworld_info info
          LEFT JOIN apworld_aliases aliases ON info.id=aliases.worldId
          WHERE worldName LIKE CONCAT('%', ?, '%') OR alias LIKE CONCAT('%', ?, '%') LIMIT 25`;
        const escapedVal = curValue.replaceAll(/([%_[])/g, '[$1]');
        const matches = await dbQueryAll(sql, [escapedVal, escapedVal]);

        await interaction.respond(matches.map((world) => ({ name: world.worldName, value: world.worldName })));
      }
    },
  ]
}
