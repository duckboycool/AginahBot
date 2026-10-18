const { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
  category: 'Bot Profile',
  commands: [{
    commandBuilder: new SlashCommandBuilder()
      .setName('set-profile-picture')
      .setDescription('Set the bot\'s profile picture for this server.')
      .addStringOption((option) => option
        .setName('image-url')
        .setDescription('Direct URL to the new profile picture')
        .setRequired(true))
      .setContexts(InteractionContextType.Guild)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const imageUrl = interaction.options.getString('image-url', true);
      if (!/^https?:\/\/\S+$/i.test(imageUrl)) {
        return interaction.reply({
          content: 'Please provide a valid image URL.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.guild.members.editMe({ avatar: imageUrl });
      return interaction.editReply('Profile picture updated.');
    },
  }, {
    commandBuilder: new SlashCommandBuilder()
      .setName('unset-profile-picture')
      .setDescription('Reset the bot\'s profile picture for this server.')
      .setContexts(InteractionContextType.Guild)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.guild.members.editMe({ avatar: null });
      return interaction.editReply('Profile picture reset.');
    },
  }],
};
