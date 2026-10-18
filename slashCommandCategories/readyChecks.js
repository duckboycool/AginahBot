const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, InteractionContextType } = require('discord.js');
const { dbExecute, dbQueryOne, dbQueryAll, replyError, verifyIsAdmin } = require('../lib');

module.exports = {
  category: 'Ready System',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('ready-create')
        .setDescription('Create a ready system in this channel.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        // Determine if a game is already running in this channel
        const existingGame = await dbQueryOne(
          'SELECT 1 FROM ready_systems WHERE guildDataId=? AND channelId=?',
          [guildData.id, interaction.channel.id]
        );
        if (existingGame) {
          return interaction.reply({
            content: 'A ready system has already been created in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Create the game in this channel
        await dbQueryOne(
          'INSERT INTO ready_systems (guildDataId, channelId, userId) VALUES (?, ?, ?)',
          [guildData.id, interaction.channel.id, interaction.user.id],
        );
        return interaction.reply({
          content: 'A ready system has been created in this channel.\n' +
            '- `/ready-join` to join the game\n' +
            '- `/ready` to indicate you are ready to begin\n' +
            '- `/unready` to indicate you are no longer ready to begin\n' +
            '- `/ready-check` to check status of users in the ready system\n' +
            '- `/ready-cancel` to delete the ready system'
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('ready-join')
        .setDescription('Join a ready system in this channel.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        // Find ready system for this channel
        const readySystem = await dbQueryOne(
          'SELECT id FROM ready_systems WHERE guildDataId=? AND channelId=?',
          [guildData.id, interaction.channel.id],
        );

        // Inform the user if there is no ready system
        if (!readySystem) {
          return interaction.reply({
            content: 'A ready system has not been created in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Add the user to the ready system
        await dbExecute(
          'REPLACE INTO ready_checks (readySystemId, userId) VALUES (?, ?)',
          [readySystem.id, interaction.user.id],
        );

        return interaction.reply({
          content: `${interaction.user} has joined the game.`,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('ready-leave')
        .setDescription('Leave a ready system in this channel.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        // Find ready system for this channel
        const readySystem = await dbQueryOne(
          'SELECT id FROM ready_systems WHERE guildDataId=? AND channelId=?',
          [guildData.id, interaction.channel.id],
        );

        // Inform the user if there is no ready system
        if (!readySystem) {
          return interaction.reply({
            content: 'A ready system has not been created in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Remove the user from the ready system
        await dbExecute(
          'DELETE FROM ready_checks WHERE readySystemId=? AND userId=?',
          [readySystem.id, interaction.user.id],
        );

        return interaction.reply({
          content: `${interaction.user} has left the game.`,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('ready')
        .setDescription('Indicate you are ready to begin.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        // Find ready system for this channel
        const readySystem = await dbQueryOne(
          'SELECT id FROM ready_systems WHERE guildDataId=? AND channelId=?',
          [guildData.id, interaction.channel.id],
        );

        // Inform the user if there is no ready system
        if (!readySystem) {
          return interaction.reply({
            content: 'A ready system has not been created in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const isJoined = await dbQueryOne(
          'SELECT 1 FROM ready_checks WHERE readySystemId=? AND userId=?',
          [readySystem.id, interaction.user.id],
        );

        if (!isJoined) {
          await dbExecute(
            'REPLACE INTO ready_checks (readySystemId, userId, isReady) VALUES (?, ?, 1)',
            [readySystem.id, interaction.user.id]
          );
        }

        await dbExecute(
          'UPDATE ready_checks SET isReady=1 WHERE readySystemId=? AND userId=?',
          [readySystem.id, interaction.member.id],
        );

        await interaction.reply({
          content: `${interaction.member} is ready to begin.`
        });

        const unreadyPlayers = await dbQueryOne(
          'SELECT 1 FROM ready_checks WHERE readySystemId=? AND NOT isReady',
          [readySystem.id],
        );

        if (!unreadyPlayers) {
          return interaction.followUp('All players are ready to begin!');
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('unready')
        .setDescription('Indicate you are no longer ready to begin.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        // Find ready system for this channel
        const readySystem = await dbQueryOne(
          'SELECT id FROM ready_systems WHERE guildDataId=? AND channelId=?',
          [guildData.id, interaction.channel.id],
        );

        // Inform the user if there is no ready system
        if (!readySystem) {
          return interaction.reply({
            content: 'A ready system has not been created in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const isJoined = await dbQueryOne(
          'SELECT 1 FROM ready_checks WHERE readySystemId=? AND userId=?',
          [readySystem.id, interaction.user.id],
        );

        if (!isJoined) {
          return interaction.reply({
            content: 'You have not joined the ready system.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute(
          'UPDATE ready_checks SET isReady=0 WHERE readySystemId=? AND userId=?',
          [readySystem.id, interaction.member.id],
        );

        return interaction.reply({
          content: `${interaction.member} is no longer ready to begin.`
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('ready-cancel')
        .setDescription('Cancel the ready system in this channel if one is present.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        // Find ready system for this channel
        const readySystem = await dbQueryOne(
          'SELECT id, userId FROM ready_systems WHERE guildDataId=? AND channelId=?',
          [guildData.id, interaction.channel.id],
        );

        // Inform the user if there is no ready system
        if (!readySystem) {
          return interaction.reply({
            content: 'A ready system has not been created in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Disallow anyone except the one who started the game from cancelling it
        if (
          !verifyIsAdmin(interaction.member) &&
          !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) &&
          !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
          !interaction.user.id !== readySystem.userId
        ) {
          return interaction.reply({
            content: `Only <@${readySystem.userId}> or an otherwise privileged user may cancel the game.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute('DELETE FROM ready_checks WHERE readySystemId=?', [readySystem.id]);
        await dbExecute('DELETE FROM ready_systems WHERE id=?', [readySystem.id]);

        return interaction.reply({
          content: `${interaction.user} has cancelled the ready system.`,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('ready-check')
        .setDescription('Check which members in the ready system are ready.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guild.id]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        // Find ready system for this channel
        const readySystem = await dbQueryOne(
          'SELECT id FROM ready_systems WHERE guildDataId=? AND channelId=?',
          [guildData.id, interaction.channel.id],
        );

        // Inform the user if there is no ready system
        if (!readySystem) {
          return interaction.reply({
            content: 'A ready system has not been created in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const players = await dbQueryAll(
          'SELECT userId, isReady FROM ready_checks WHERE readySystemId=?',
          [readySystem.id],
        );

        if (!players) {
          return interaction.reply({
            content: 'No players have joined the ready system.',
            flags: MessageFlags.Ephemeral,
          });
        }

        let content = '## Players:';
        players.forEach((p) => content += `\n- ${p.isReady ? '✅' : '❌'} <@${p.userId}>`);

        return interaction.reply({
          content,
          allowedMentions: {},
        });
      }
    },
  ],
};
