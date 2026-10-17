const { modContactEnabled, fetchModContact } = require('../slashCommandCategories/modContact');
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { dbExecute } = require('../lib');

module.exports = async (client, interaction) => {
  // Only listen for button interactions
  if (!interaction.isButton()) { return; }

  // Only listen for the target interaction having customId mod-contact
  if (!interaction.hasOwnProperty('customId') || interaction.customId !== 'mod-contact') { return; }

  if (!await modContactEnabled(interaction.guild)) {
    await interaction.user.send('Something went wrong and a mod-contact could not be created.');

    // Inform Discord the interaction was handled, but do not change the original message
    return interaction.update({});
  }

  // Check if the DB believes a mod-contact exists for this user already
  const existingChannel = await fetchModContact(interaction.guild, interaction.member);
  if (existingChannel) {
    return interaction.reply({
      content: `You already have a mod-contact open here: ${existingChannel}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Show the modal prompting for details about the reason for contact
  return interaction.showModal(
    new ModalBuilder()
      .setCustomId('mod-contact-modal')
      .setTitle('Mod Contact')
      .addComponents(...[
        new ActionRowBuilder().addComponents(...[
          new TextInputBuilder()
            .setCustomId('details')
            .setLabel('Reason for Contact')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1500)
        ])
      ])
  );
};
