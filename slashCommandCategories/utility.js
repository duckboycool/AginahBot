const { SlashCommandBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const tmp = require('tmp');
const fs = require('fs');
const { dbExecute, dbQueryOne, managesThread, replyError, saveMessageLog, verifyModRole } = require('../lib');

module.exports = {
  category: 'Utility Commands',
  commands: [
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('save-log')
        .setDescription('Save a log of recent channel messages to a text file.')
        .addIntegerOption((opt) => opt
          .setName('limit')
          .setDescription('Number of messages to save. Min 1, max 5000, default 100')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const limit = interaction.options.getInteger('limit') ?? 100;

        // Do not fetch more than 5000 messages from the Discord API
        if (limit < 1 || limit > 5000) {
          return interaction.reply({
            content: 'Limit argument must be an integer from 1 to 1000.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          // This might take a few seconds
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const output = await saveMessageLog(interaction.channel, interaction.id, limit);

          // Save the output to a temporary file and send it to the channel
          return tmp.file((err, tmpFilePath, fd, cleanupCallback) => {
            fs.writeFile(tmpFilePath, output, () => {
              // The followUp here seems to sometimes give an 'Unknown Message' error on the interaction
              // response itself, particularly when it takes longer. Not really sure why.
              return interaction.followUp({
                content: `Saved a log of the previous ${limit} messages in this channel.`,
                files: [
                  {
                    name: `${interaction.channel.name}-log.txt`,
                    attachment: tmpFilePath,
                  }
                ],
                flags: MessageFlags.Ephemeral,
              });
            });
          });
        } catch (e) {
          return interaction.followUp(replyError('Something went wrong and the channel logs could not be saved.\n'));
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('thread-purge')
        .setDescription('Remove all members (except mods) from the current thread who are inactive.')
        .addIntegerOption((opt) => opt
          .setName('days')
          .setDescription('Number of days of inactivity for cutoff. Min 1, default 60')
          .setRequired(false))
        .addBooleanOption((opt) => opt
          .setName('dry-run')
          .setDescription('Run a test to see how many users would be removed without actually removing them')
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),
      async execute(interaction) {
        if (!await verifyModRole(interaction.member)) {
          return interaction.reply({
            content: 'Only moderators can delete world info entries.',
            flags: MessageFlags.Ephemeral,
          })
        }

        const days = interaction.options.getInteger('days') ?? 60;
        const doPurge = !interaction.options.getBoolean('dry-run');

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Unable to process request. No guild data exists for this guild. '),
            flags: MessageFlags.Ephemeral,
          });
        }

        if (days < 1) {
          return interaction.reply({
            content: 'Invalid activity cutoff.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!interaction.channel.isThread()) {
          return interaction.reply({
            content: 'Cannot purge non-thread channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        console.info('Running purge...');

        let totalPurgedMembers = 0;

        try {
          const targetDate = Math.floor(Date.now() - (days * 24 * 60 * 60 * 1000));
          console.info(`\nFetching messages since ${new Date(targetDate).toISOString()}`);
          const messages = await fetchMessagesSince(interaction.channel, targetDate);
          console.info(`Found ${messages.length} messages total`);

          // Fetch full user list for thread
          console.info('\nFetching thread members');
          const threadMembers = await fetchThreadMembers(interaction.channel);
          console.debug(`Found ${threadMembers.length} members`);

          // Identify unique active thread members
          const activeUsers = new Set();
          messages.forEach((msg) => {
            activeUsers.add(msg.author.id);
          });
          console.debug(`\n${activeUsers.size} unique users have sent messages in given period`);

          // Remove thread members who have not sent a message in specified time
          console.info('Purging inactive members...');
          for (let member of threadMembers) {
            const hasPerms = await managesThread(guildData.id, interaction.channel, member.guildMember);

            if (!(activeUsers.has(member.id) || hasPerms || member.user.bot)) {
              console.info(`Removing ${member.user.username}`);
              totalPurgedMembers++;
              if (doPurge) {
                await interaction.channel.members.remove(member.id);
                await new Promise((resolve) => setTimeout(resolve, 600));
              }
            }
          }
        } catch (e) {
          return interaction.followUp(replyError('Something went wrong and the thread could not be purged.\n'));
        }

        console.info(`Purged ${totalPurgedMembers} users`);
        return interaction.followUp(`Purged ${totalPurgedMembers} users`);
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('set-moderator-role')
        .setDescription('Assign a new role to use as the Moderator role when determining moderator actions.')
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('New moderator role')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const role = interaction.options.getRole('role', true);
        await dbExecute('UPDATE guild_data SET moderatorRoleId=? WHERE guildId=?', [role.id, interaction.guildId]);
        return interaction.reply({
          content: `Moderator role updated to ${role}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('set-lead-mod-role')
        .setDescription('Assign a new role to use as the Lead Moderator role when determining moderator actions.')
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('New lead moderator role')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        const role = interaction.options.getRole('role', true);
        await dbExecute('UPDATE guild_data SET leadModRoleId=? WHERE guildId=?', [role.id, interaction.guildId]);
        return interaction.reply({
          content: `Lead Moderator role updated to ${role}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('set-alerts-channel')
        .setDescription('Change channel to put spam/piracy reports in.')
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
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('set-alerts-purge')
        .setDescription('Enable or disable automatic message purging/timeout for spam filter.')
        .addBooleanOption((opt) => opt
          .setName('toggle')
          .setDescription('True to enable, False to disable')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const toggle = interaction.options.getBoolean('toggle', true);

        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Uh-oh. Something is weird in my database.\n' + 
              `\`\`\`guild data is missing for guild with id ${interaction.guildId}\`\`\`\n`),
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute('UPDATE guild_options SET spamPurge=? WHERE guildDataId=?', [toggle ? 1 : 0, guildData.id]);
        return interaction.reply({
          content: `${toggle ? 'Enabled' : 'Disabled'} spam auto-purge`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('add-pinned-post')
        .setDescription('Set forum post to automatically be re-pinned.')
        .addChannelOption((opt) => opt
          .setName('post')
          .setDescription('Post to enable auto-pinning for')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),
      async execute(interaction) {
        const post = interaction.options.getChannel('post', true);

        if (!post.isThread()) {
          return interaction.reply({
            content: 'Given channel is not a post.',
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!post.parent.isThreadOnly()) {
          return interaction.reply({
            content: 'Given thread is not a forum post.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const sql = 'SELECT postId FROM pinned_forum_posts WHERE channelId=?';
        const forumAlreadyPinned = await dbQueryOne(sql, [post.parentId]);
        if (forumAlreadyPinned) {
          return interaction.reply({
            content: `The post <#${forumAlreadyPinned.postId}> is already pinned in that forum.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute('INSERT INTO pinned_forum_posts (channelId, postId) VALUES (?, ?)', [post.parentId, post.id]);
        return interaction.reply({
          content: 'Enabled auto-pinning of post.',
          flags: MessageFlags.Ephemeral,
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('remove-pinned-post')
        .setDescription('Remove auto-pinning from a post.')
        .addChannelOption((opt) => opt
          .setName('post')
          .setDescription('Post to disable auto-pinning for')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),
      async execute(interaction) {
        const post = interaction.options.getChannel('post', true);

        if (!post.isThread()) {
          return interaction.reply({
            content: 'Given channel is not a post.',
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!post.parent.isThreadOnly()) {
          return interaction.reply({
            content: 'Given thread is not a forum post.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await dbExecute('DELETE FROM pinned_forum_posts WHERE postId=?', [post.id]);
        return interaction.reply({
          content: 'Disabled auto-pinning of post.',
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  ],
};

// Subroutines copied over from purge script
const fetchMessagesSince = async (threadChannel, oldestTimestamp, limit=100, messageCache=[]) => {
  // Fetch messages prior to the oldest (first) message in the cache
  const messages = await threadChannel.messages.fetch({
    limit: limit,
    before: messageCache[0]?.id || null,
  });

  // Prepend newly fetched messages to the front of a working array
  const msgArray = [];
  const foundMessages = messages.map((m) => m).reverse();
  for (let msg of foundMessages) {
    if (msg.createdTimestamp >= oldestTimestamp) {
      msgArray.push(msg);
    }
  }
  msgArray.push(...messageCache);

  // If no more messages are available, return what was found
  if (foundMessages.length < limit) {
    // Return messages
    return msgArray;
  }

  // Wait half a second to prevent rate-limiting
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Fetch more messages if the desired timestamp has not been reached
  if (foundMessages[0].createdTimestamp >= oldestTimestamp) {
    console.info(`\n${new Date(msgArray[0].createdTimestamp).toISOString()}`);
    console.info(`Message count: ${msgArray.length}`);
    return await fetchMessagesSince(threadChannel, oldestTimestamp, limit, msgArray);
  }

  // Return messages
  return msgArray;
};

const fetchThreadMembers = async (threadChannel, limit=100, userCache=[]) => {
  const members = await threadChannel.members.fetch({
    limit,
    after: userCache[userCache.length-1]?.id || null,
    withMember: true,
  });

  const userArray = [...userCache];
  members.each((member) => {
    if (!member.bot) {
      userArray.push(member);
    }
  });

  if (members.size < limit) {
    return userArray;
  }

  console.info(`User count: ${userArray.length}`);
  return await fetchThreadMembers(threadChannel, limit, userArray);
};
