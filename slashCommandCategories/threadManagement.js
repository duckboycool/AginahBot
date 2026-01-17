const { dbExecute, dbQueryOne, managesThread, dbQueryAll, replyError } = require('../lib');
const { SlashCommandBuilder, InteractionContextType, MessageFlags, PermissionsBitField,
  PermissionFlagsBits } = require('discord.js');

module.exports = {
  category: 'Thread Management',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('grant-perms')
        .setDescription('Grant a user permission to manage the current thread')
        .addUserOption((opt) => opt
          .setName('user')
          .setDescription('User to grant permission for')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const user = interaction.options.getUser('user', true);

        if (!interaction.channel.isTextBased() || interaction.channel.isVoiceBased()) {
          return interaction.reply({
            content: 'The channel must be a text channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!await managesThread(guildData.id, interaction)) {
          return interaction.reply({
            content: 'You are not able to give permissions in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await dbExecute('INSERT INTO thread_management (guildDataId, channelId, userId) VALUES (?, ?, ?)', [
            guildData.id, interaction.channelId, user.id
          ]);
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return interaction.reply({
              content: 'Specified user already has permissions.',
              flags: MessageFlags.Ephemeral,
            });
          } else {
            return interaction.reply({
              content: 'Error adding permissions.',
              flags: MessageFlags.Ephemeral,
            });
          }
        }

        let grantMessage = `${user}, you have been granted management perms in this channel. You can use \`/pin\` `
                         + 'and `/unpin` to manage pins, ';
        // In forum channel
        if (interaction.channel.parent?.isThreadOnly()) {
          grantMessage += '`/tag-thread` and `/untag-thread` to manage tags, ';
        }
        if (interaction.channel.isThread()) {
          grantMessage += '`/set-title` to change the title, ';
        }
        grantMessage += 'and `/grant-perms` to give others these permissions.';

        await interaction.channel.send(grantMessage);
        return interaction.reply({
          content: 'Permission granted.',
          flags: MessageFlags.Ephemeral,
        });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('revoke-perms')
        .setDescription('Revoke permission for a user to manage the current thread')
        .addUserOption((opt) => opt
          .setName('user')
          .setDescription('User to revoke permissions for')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const user = interaction.options.getUser('user', true);

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute('DELETE FROM thread_management WHERE guildDataId=? AND channelId=? AND userId=?', [
          guildData.id, interaction.channelId, user.id
        ]);

        return interaction.reply({
          content: 'Permission revoked.',
          flags: MessageFlags.Ephemeral,
        });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('pin')
        .setDescription('Pin a message in this channel.')
        .addStringOption((opt) => opt
          .setName('message')
          .setDescription('The ID of or link to the message to pin.')
          .setMaxLength(512)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (!permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Manage Messages)',
            flags: MessageFlags.Ephemeral,
          });
        }

        let messageId = interaction.options.getString('message');
        if (/.*discord.*\/\d+$/.test(messageId)) {
          const output = messageId.match(/.*discord.*\/(\d+)$/);
          messageId = output[1];
        }

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!await managesThread(guildData.id, interaction)) {
          return interaction.reply({
            content: 'You do not have permission to pin messages in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (!message.pinned) {
            await message.pin();
            return interaction.reply({
              content: 'Message pinned.',
              flags: MessageFlags.Ephemeral,
            });
          }

          return interaction.reply({
            content: 'That message is already pinned.',
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          if (err.status && err.status === 404) {
            return interaction.reply({
              content: 'No message with that ID could be found.',
              flags: MessageFlags.Ephemeral,
            });
          }

          throw err;
        }
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('unpin')
        .setDescription('Unpin a message in this channel.')
        .addStringOption((opt) => opt
          .setName('message')
          .setDescription('The ID of or link to the message to unpin.')
          .setMaxLength(512)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const permissions = interaction.channel.permissionsFor(interaction.client.user);
        if (!permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return interaction.reply({
            content: 'Required permissions are missing for this command. (Manage Messages)',
            flags: MessageFlags.Ephemeral,
          });
        }

        let messageId = interaction.options.getString('message');
        if (/.*discord.*\/\d+$/.test(messageId)) {
          const output = messageId.match(/.*discord.*\/(\d+)$/);
          messageId = output[1];
        }

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!await managesThread(guildData.id, interaction)) {
          return interaction.reply({
            content: 'You do not have permission to unpin messages in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (message.pinned) {
            await message.unpin();
            return interaction.reply({
              content: 'Message unpinned.',
              flags: MessageFlags.Ephemeral,
            });
          }

          return interaction.reply({
            content: 'That message is not pinned.',
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          if (err.status && err.status === 404) {
            return interaction.reply({
              content: 'No message with that ID could be found.',
              flags: MessageFlags.Ephemeral,
            });
          }

          throw err;
        }
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('perms-list')
        .setDescription('List all users with thread permissions')
        .addChannelOption((opt) => opt
          .setName('channel')
          .setDescription('Channel for which permissions will be displayed. Defaults to current channel.')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const channel = interaction.options.getChannel('channel') ?? interaction.channel;

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        let sql = '';
        let results = [];
        if (channel) {
          sql = 'SELECT channelId, userId FROM thread_management WHERE guildDataId=? AND channelId=?';
          results = await dbQueryAll(sql, [guildData.id, channel.id]);
        } else {
          sql = 'SELECT channelId, userId FROM thread_management WHERE guildDataId=?';
          results = await dbQueryAll(sql, [guildData.id]);
        }

        if (results.length === 0) {
          return interaction.reply({
            content: `No users have thread permissions${channel ? ' in that channel.' : '.'}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        let content = '';
        for (let row of results) {
          content += `<@${row.userId}> has thread permissions in <#${row.channelId}>.\n`;
        }

        return interaction.reply({ content, flags: MessageFlags.Ephemeral });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-thread')
        .setDescription('Add a tag to the current thread')
        .addStringOption((opt) => opt
          .setName('tag')
          .setDescription('Tag name to add to the post.')
          .setMaxLength(20)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!await managesThread(guildData.id, interaction)) {
          return interaction.reply({
            content: 'You do not have permission to edit tags in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!interaction.channel.parent?.isThreadOnly()) {
          return interaction.reply({
            content: 'Cannot add tags outside of a forum thread.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const tagName = interaction.options.getString('tag');
        const tag = interaction.channel.parent.availableTags.find(
          (tag) => tag.name.toLowerCase() === tagName.toLowerCase()
        );

        if (!tag) {
          return interaction.reply({
            content: `Tag \`${tagName}\` is invalid.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        let channelTags = interaction.channel.appliedTags;
        if (channelTags.includes(tag.id)) {
          return interaction.reply({
            content: `Tag \`${tag.name}\` already on post.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        channelTags.push(tag.id);
        await interaction.channel.setAppliedTags(channelTags);

        return interaction.reply({
          content: 'Added tag.',
          flags: MessageFlags.Ephemeral,
        });
      },
      async autocomplete(interaction) {
        if (!interaction.channel.parent?.isThreadOnly()) {
          await interaction.respond([]);
          return;
        }

        const curValue = interaction.options.getFocused().toLowerCase();
        const matches = interaction.channel.parent.availableTags.filter(
          (tag) => tag.name.toLowerCase().includes(curValue) && !interaction.channel.appliedTags.includes(tag.id)
        );

        await interaction.respond(matches.map((tag) => ({ name: tag.name, value: tag.name })));
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('untag-thread')
        .setDescription('Remove a tag from the current thread')
        .addStringOption((opt) => opt
          .setName('tag')
          .setDescription('Tag name to remove from the post.')
          .setMaxLength(20)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!await managesThread(guildData.id, interaction)) {
          return interaction.reply({
            content: 'You do not have permission to edit tags in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!interaction.channel.parent?.isThreadOnly()) {
          return interaction.reply({
            content: 'Cannot remove tags outside of a forum thread.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const tagName = interaction.options.getString('tag');
        const tag = interaction.channel.parent.availableTags.find(
          (tag) => tag.name.toLowerCase() === tagName.toLowerCase()
        );

        if (!tag) {
          return interaction.reply({
            content: `Tag \`${tagName}\` is invalid.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        let channelTags = interaction.channel.appliedTags;
        if (!channelTags.includes(tag.id)) {
          return interaction.reply({
            content: `Tag \`${tag.name}\` not on post.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.channel.setAppliedTags(channelTags.filter((id) => id !== tag.id));

        return interaction.reply({
          content: 'Removed tag.',
          flags: MessageFlags.Ephemeral,
        });
      },
      async autocomplete(interaction) {
        if (!interaction.channel.parent?.isThreadOnly()) {
          await interaction.respond([]);
          return;
        }

        const curValue = interaction.options.getFocused().toLowerCase();
        const matches = interaction.channel.parent.availableTags.filter(
          (tag) => tag.name.toLowerCase().includes(curValue) && interaction.channel.appliedTags.includes(tag.id)
        );

        await interaction.respond(matches.map((tag) => ({ name: tag.name, value: tag.name })));
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('set-title')
        .setDescription('Change title of current thread')
        .addStringOption((opt) => opt
          .setName('title')
          .setDescription('The new title to set the thread to.')
          .setMaxLength(100)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!await managesThread(guildData.id, interaction)) {
          return interaction.reply({
            content: 'You do not have permission to edit the title in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!interaction.channel.isThread()) {
          return interaction.reply({
            content: 'Cannot change title outside of a thread.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const name = interaction.options.getString('title');
        await interaction.channel.setName(name);

        return interaction.reply({
          content: 'Changed title.',
          flags: MessageFlags.Ephemeral,
        });
      },
    },
  ],
};
