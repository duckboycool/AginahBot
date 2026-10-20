const { dbQueryOne, dbQueryAll, dbExecute, replyError, tagNameMaxLen, tagContentMaxLen } = require('../lib');
const { SlashCommandBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } = require('discord.js');

const autocompleteTag = async (interaction) => {
  const curValue = interaction.options.getString('tag-name', true);

  // Probably a better way to do this one as well
  const sql = `SELECT DISTINCT tagName, tags.id FROM
    (SELECT tagName, tagName alias, id, guildDataId FROM message_tags UNION
     SELECT tagName, alias, tagId id, guildDataId FROM tag_aliases
     JOIN message_tags ON message_tags.id=tag_aliases.tagId) tags
    JOIN guild_data gd ON gd.id=guildDataId
    WHERE guildId=? AND alias LIKE CONCAT('%', ?, '%') LIMIT 25`;
  const escapedVal = curValue.replaceAll(/([%_[])/g, '[$1]');
  const matches = await dbQueryAll(sql, [interaction.guildId, escapedVal]);

  return interaction.respond(matches.map((tag) => ({ name: tag.tagName, value: tag.tagName })));
};

module.exports = {
  category: 'Message Tags',
  commands: [
    {
      longDescription: 'Add or update a tag for a server. If a user includes this tag in any part of ' +
        'a message, the bot will respond with the content of this tag. Tags may contain only letters, ' +
        'numbers, and underscores.',
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-add')
        .setDescription('Add or update a tag for this server.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('The tag to respond to')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('content')
          .setDescription('The text which will be displayed when a tag is found in a message')
          .setMaxLength(tagContentMaxLen)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name').toLowerCase();
        const content = interaction.options.getString('content');

        // Tags may contain only alphanumeric characters
        if (tagName.search(/\W/) > -1) {
          return interaction.reply({
            content: 'Tag names may contain only letters, numbers, and underscores.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Fetch guildDataId
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Uh-oh. Something is weird in my database.\n' + 
              `\`\`\`guild data is missing for guild with id ${interaction.guildId}\`\`\`\n`),
            flags: MessageFlags.Ephemeral,
          });
        }

        let sql = `SELECT tagName FROM tag_aliases alias JOIN message_tags tag ON alias.tagId=tag.id
                   WHERE guildDataId=? AND alias=?`;
        const existingAlias = await dbQueryOne(sql, [guildData.id, tagName]);
        if (existingAlias) {
          return interaction.reply({
            content: `The \`${existingAlias.tagName}\` tag already has \`${tagName}\` as an alias.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Save new tag to database
        sql = `REPLACE INTO message_tags (guildDataId, tagName, tagContent, createdByUserId) VALUES (?, ?, ?, ?)`;
        await dbExecute(sql, [guildData.id, tagName, content, interaction.user.id]);

        return interaction.reply({
          content: `Set content for tag \`${tagName}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-delete')
        .setDescription('Remove a &tag from a server.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('Name of the tag to be removed')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name').toLowerCase();

        // Fetch guildDataId
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Uh-oh. Something is weird in my database.\n' + 
              `\`\`\`guild data is missing for guild with id ${interaction.guildId}\`\`\`\n`),
            flags: MessageFlags.Ephemeral,
          });
        }

        // If the tag does not exist, inform the user
        let sql = `SELECT mt.id
                   FROM message_tags mt
                   JOIN guild_data gd ON mt.guildDataId = gd.id
                   WHERE gd.guildId=?
                    AND mt.tagName=?`;
        const existing = await dbQueryOne(sql, [interaction.guildId, tagName]);
        if (!existing) {
          return interaction.reply({
            content: 'That tag does not exist on this server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Delete the tag from the database
        await dbExecute('DELETE FROM message_tags WHERE id=?', [existing.id]);
        await dbExecute('DELETE FROM tag_aliases WHERE tagId=?', [existing.id]);

        return interaction.reply({
          content: `Deleted tag \`${tagName}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      autocomplete: autocompleteTag
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-alias')
        .setDescription('Add an alias to an existing tag in this server.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('The tag to add an alias to')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption((opt) => opt
          .setName('alias')
          .setDescription('The alias to be added')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name').toLowerCase();
        const alias = interaction.options.getString('alias').toLowerCase();

        // Tags may contain only alphanumeric characters
        if (alias.search(/\W/) > -1) {
          return interaction.reply({
            content: 'Tag names may contain only letters, numbers, and underscores.',
            flags: MessageFlags.Ephemeral,
          });
        }

        // Fetch guildDataId
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Uh-oh. Something is weird in my database.\n' + 
              `\`\`\`guild data is missing for guild with id ${interaction.guildId}\`\`\`\n`),
            flags: MessageFlags.Ephemeral,
          });
        }

        const tagId = await dbQueryOne(
          'SELECT id FROM message_tags WHERE guildDataId=? AND tagName=?', [guildData.id, tagName]
        );
        if (!tagId) {
          return interaction.reply({
            content: `Could not find tag \`${tagName}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const existingTag = await dbQueryOne(
          'SELECT 1 FROM message_tags WHERE guildDataId=? AND tagName=?', [guildData.id, alias]
        );
        if (existingTag) {
          return interaction.reply({
            content: `There is already a \`${alias}\` tag.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const sql = `SELECT tagName FROM tag_aliases alias JOIN message_tags tag ON alias.tagId=tag.id
                     WHERE guildDataId=? AND alias=?`;
        const existingAlias = await dbQueryOne(sql, [guildData.id, alias]);
        if (existingAlias) {
          return interaction.reply({
            content: `The \`${existingAlias.tagName}\` tag already has \`${alias}\` as an alias.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Save new alias to database
        await dbExecute('INSERT INTO tag_aliases (tagId, alias) VALUES (?, ?)', [tagId.id, alias]);

        return interaction.reply({
          content: `Set \`${alias}\` as an alias for tag \`${tagName}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      autocomplete: autocompleteTag
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-unalias')
        .setDescription('Remove an existing alias for a tag in this server.')
        .addStringOption((opt) => opt
          .setName('tag-name')
          .setDescription('The tag to remove an alias from')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption((opt) => opt
          .setName('alias')
          .setDescription('The alias to be removed')
          .setMaxLength(tagNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async execute(interaction) {
        const tagName = interaction.options.getString('tag-name').toLowerCase();
        const alias = interaction.options.getString('alias').toLowerCase();

        // Fetch guildDataId
        const guildData = await dbQueryOne('SELECT id FROM guild_data WHERE guildId=?', [interaction.guildId]);
        if (!guildData) {
          return interaction.reply({
            content: replyError('Uh-oh. Something is weird in my database.\n' + 
              `\`\`\`guild data is missing for guild with id ${interaction.guildId}\`\`\`\n`),
            flags: MessageFlags.Ephemeral,
          });
        }

        const tagId = await dbQueryOne(
          'SELECT id FROM message_tags WHERE guildDataId=? AND tagName=?', [guildData.id, tagName]
        );
        if (!tagId) {
          return interaction.reply({
            content: `Could not find tag \`${tagName}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const aliasId = await dbQueryOne(
          'SELECT alias.id FROM tag_aliases alias WHERE tagId=? AND alias=?', [tagId.id, alias]
        );
        if (!aliasId) {
          return interaction.reply({
            content: `Could not find the alias \`${alias}\` on \`${tagName}\`.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Remove alias from db
        await dbExecute('DELETE FROM tag_aliases WHERE id=?', [aliasId.id]);

        return interaction.reply({
          content: `Removed \`${alias}\` as an alias for tag \`${tagName}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      },
      async autocomplete(interaction) {
        const field = interaction.options.getFocused(true);
        if (field.name === 'tag-name') {
          return autocompleteTag(interaction);
        }

        const tagName = interaction.options.getString('tag-name');
        if (!tagName || field.name !== 'alias') {
          return interaction.respond([]);
        }
        const match = await dbQueryOne('SELECT * FROM message_tags WHERE tagName=?', [tagName]);
        if (!match) {
          return interaction.respond([]);
        }

        const sql = `SELECT alias FROM tag_aliases WHERE tagId=? AND alias LIKE CONCAT('%', ?, '%') LIMIT 25`;
        const escapedVal = field.value.replaceAll(/([%_[])/g, '[$1]');

        const matches = await dbQueryAll(sql, [match.id, escapedVal]);
        return interaction.respond(matches.map((match) => ({ name: match.alias, value: match.alias })));
      },
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('tag-list')
        .setDescription('List all &tags available on this server.')
        .setContexts(InteractionContextType.Guild),
      async execute(interaction) {
        // Fetch guild tags
        let sql = `SELECT mt.tagName
                   FROM message_tags mt
                   JOIN guild_data gd ON mt.guildDataId = gd.id
                   WHERE gd.guildId=?`;
        const tags = await dbQueryAll(sql, [interaction.guildId]);

        // If there are no tags available for this guild, inform the user
        if (tags.length === 0) {
          return interaction.reply('There are currently no tags available on this server.');
        }

        // Build a string containing all the tag names surrounded by backticks
        let tagString = '';
        tags.forEach((tag) => tagString += `\`${tag.tagName}\`, `);
        tagString = tagString.slice(0, -2);
        tagString = `The following tags are available on this server:\n${tagString}`;

        // Send the list of tags to the user
        if (tagString.length <= 2000) {
          return interaction.reply(tagString);
        } else {
          return interaction.reply('Message tag list is too long to send!');
        }
      }
    }
  ],
};
