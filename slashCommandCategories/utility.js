const { SlashCommandBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const tmp = require('tmp');
const fs = require('fs');
const { dbExecute, dbQueryOne, managesThread, replyError } = require('../lib');

module.exports = {
  category: 'Utility Commands',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('set-alerts-channel')
        .setDescription('Change channel to put spam reports in.')
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('New channel to set')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const channel = interaction.options.getChannel('channel', true);
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Uh-oh. Something is weird in my database.\n' + 
              `\`\`\`guild data is missing for guild with id ${interaction.guildId}\`\`\`\n`),
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute('UPDATE guild_options SET alertsChannelId=? WHERE guildDataId=?', [channel.id, guildData.id]);
        return interaction.reply({
          content: `Alerts channel updated to ${channel}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  ],
};
