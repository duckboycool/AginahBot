const { SlashCommandBuilder, InteractionContextType, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { dbExecute, dbQueryOne, verifyModeratorRole, dbQueryAll} = require('../lib');

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
            ephemeral: true,
          });
        }

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        // Require user to either have thread perms, or perms in server
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
          let sql = 'SELECT 1 FROM thread_management WHERE guildDataId=? AND channelId=? AND userId=?';
          const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);

          if (!permission) {
            return interaction.reply({
              content: 'You are not able to give permissions in this channel.',
              ephemeral: true,
            });
          }
        }

        await dbExecute('REPLACE INTO thread_management (guildDataId, channelId, userId) VALUES (?, ?, ?)', [
          guildData.id, interaction.channelId, user.id
        ]);

        return interaction.reply({
          content: 'Permission granted.',
          ephemeral: true,
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
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        await dbExecute('DELETE FROM thread_management WHERE guildDataId=? AND channelId=? AND userId=?', [
          guildData.id, interaction.channelId, user.id
        ]);

        return interaction.reply({
          content: 'Permission revoked.',
          ephemeral: true,
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
            ephemeral: true,
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
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        let sql = 'SELECT 1 FROM thread_management WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to pin messages in this channel.',
            ephemeral: true,
          });
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (!message.pinned) {
            await message.pin();
            return interaction.reply({
              content: 'Message pinned.',
              ephemeral: true,
            });
          }

          return interaction.reply({
            content: 'That message is already pinned.',
            ephemeral: true,
          });
        } catch (err) {
          if (err.status && err.status === 404) {
            return interaction.reply({
              content: 'No message with that ID could be found.',
              ephemeral: true,
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
            ephemeral: true,
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
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        let sql = 'SELECT 1 FROM thread_management WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to unpin messages in this channel.',
            ephemeral: true,
          });
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (message.pinned) {
            await message.unpin();
            return interaction.reply({
              content: 'Message unpinned.',
              ephemeral: true,
            });
          }

          return interaction.reply({
            content: 'That message is not pinned.',
            ephemeral: true,
          });
        } catch (err) {
          if (err.status && err.status === 404) {
            return interaction.reply({
              content: 'No message with that ID could be found.',
              ephemeral: true,
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
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
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
            ephemeral: true,
          });
        }

        let content = '';
        for (let row of results) {
          content += `<@${row.userId}> has thread permissions in <#${row.channelId}>.\n`;
        }

        return interaction.reply({ content, ephemeral: true });
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
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        let sql = 'SELECT 1 FROM thread_management WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to edit tags in this channel.',
            ephemeral: true,
          });
        }

        if (!interaction.channel.parent?.isThreadOnly()) {
          return interaction.reply({
            content: 'Cannot add tags outside of a forum thread.',
            ephemeral: true,
          });
        }

        const tagName = interaction.options.getString('tag');
        const tag = interaction.channel.parent.availableTags.find(
          (tag) => tag.name.toLowerCase() === tagName.toLowerCase()
        );

        if (!tag) {
          return interaction.reply({
            content: `Tag \`${tagName}\` is invalid.`,
            ephemeral: true,
          });
        }

        let channelTags = interaction.channel.appliedTags;
        if (channelTags.includes(tag.id)) {
          return interaction.reply({
            content: `Tag \`${tag.name}\` already on post.`,
            ephemeral: true,
          });
        }

        channelTags.push(tag.id);
        await interaction.channel.setAppliedTags(channelTags);

        return interaction.reply({
          content: 'Added tag.',
          ephemeral: true,
        });
      },
      async autocomplete(interaction) {
        if (!interaction.channel.parent?.isThreadOnly()) {
          await interaction.respond([]);
          return;
        }

        const curValue = interaction.options.getFocused();
        const matches = interaction.channel.parent.availableTags.filter(
          (tag) => tag.name.includes(curValue) && !interaction.channel.appliedTags.includes(tag.id)
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
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        let sql = 'SELECT 1 FROM thread_management WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to edit tags in this channel.',
            ephemeral: true,
          });
        }

        if (!interaction.channel.parent?.isThreadOnly()) {
          return interaction.reply({
            content: 'Cannot remove tags outside of a forum thread.',
            ephemeral: true,
          });
        }

        const tagName = interaction.options.getString('tag');
        const tag = interaction.channel.parent.availableTags.find(
          (tag) => tag.name.toLowerCase() === tagName.toLowerCase()
        );

        if (!tag) {
          return interaction.reply({
            content: `Tag \`${tagName}\` is invalid.`,
            ephemeral: true,
          });
        }

        let channelTags = interaction.channel.appliedTags;
        if (!channelTags.includes(tag.id)) {
          return interaction.reply({
            content: `Tag \`${tag.name}\` not on post.`,
            ephemeral: true,
          });
        }

        await interaction.channel.setAppliedTags(channelTags.filter((id) => id !== tag.id));

        return interaction.reply({
          content: 'Removed tag.',
          ephemeral: true,
        });
      },
      async autocomplete(interaction) {
        if (!interaction.channel.parent?.isThreadOnly()) {
          await interaction.respond([]);
          return;
        }

        const curValue = interaction.options.getFocused();
        const matches = interaction.channel.parent.availableTags.filter(
          (tag) => tag.name.includes(curValue) && interaction.channel.appliedTags.includes(tag.id)
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
            content: 'Unable to process request. No guild data exists for this guild. Please submit a bug report.',
            ephemeral: true,
          });
        }

        let sql = 'SELECT 1 FROM thread_management WHERE guildDataId=? AND channelId=? AND userId=?';
        const permission = await dbQueryOne(sql, [guildData.id, interaction.channelId, interaction.member.id]);
        if (!permission && !await verifyModeratorRole(interaction.member)) {
          return interaction.reply({
            content: 'You do not have permission to edit the title in this channel.',
            ephemeral: true,
          });
        }

        if (!interaction.channel.isThread()) {
          return interaction.reply({
            content: 'Cannot change title outside of a thread.',
            ephemeral: true,
          });
        }

        const name = interaction.options.getString('title');
        await interaction.channel.setName(name);

        return interaction.reply({
          content: 'Changed title.',
          ephemeral: true,
        });
      },
    },
  ],
};
