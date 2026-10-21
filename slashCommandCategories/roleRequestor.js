const { parseEmoji, dbQueryOne, dbQueryAll, dbExecute, updateCategoryMessage, replyError,
  categoryNameMaxLen, categoryDescMaxLen } = require('../lib');
const { ChannelType, PermissionsBitField, SlashCommandBuilder, InteractionContextType, PermissionFlagsBits,
  MessageFlags } = require('discord.js');

const autocompleteCategory = async (interaction, name = 'category-name') => {
  const curValue = interaction.options.getString(name, true);

  const sql = `SELECT categoryName as name FROM role_categories rc
    JOIN role_systems rs ON rs.id=rc.roleSystemId
    JOIN guild_data gd ON gd.id=rs.guildDataId
    WHERE gd.guildId=? AND categoryName LIKE CONCAT('%', ?, '%') LIMIT 25`;
  const escapedVal = curValue.replaceAll(/([%_[])/g, '[$1]');
  const matches = await dbQueryAll(sql, [interaction.guildId, escapedVal]);

  return interaction.respond(matches.map((category) => ({ name: category.name, value: category.name })));
};

module.exports = {
  category: 'Role Requestor',
  commands: [
    {
      longDescription: 'Create a #role-request text channel for users to interact with' +
        'AginahBot and request roles. This channel will be used to post role category messages users can click to ' +
        'to add or remove roles.',
      commandBuilder: new SlashCommandBuilder()
        .setName('role-system-enable')
        .setDescription('Enable the role system on this server.')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        let sql = `SELECT gd.id AS guildDataId, rs.id AS roleSystemId
                    FROM guild_data gd
                    LEFT JOIN role_systems rs ON gd.id = rs.guildDataId
                    WHERE gd.guildId=?`;
        const row = await dbQueryOne(sql, [interaction.guildId]);
        if (!row) { throw new Error(); }
        if (row.roleSystemId) {
          return interaction.reply({
            content: 'The role system has already been set up on your server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        interaction.guild.channels.create({
          name: 'role-request',
          type: ChannelType.GuildText,
          topic: 'Request roles so that you may be pinged for various notifications.',
          reason: 'Role Request system created.',
          permissionOverwrites: [
            {
              id: interaction.client.user.id,
              allow: [ PermissionsBitField.Flags.SendMessages ],
            },
            {
              id: interaction.guild.roles.everyone.id,
              deny: [ PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions ],
            }
          ],
        }).then(async (channel) => {
          // Add role system data to the database
          let sql = 'INSERT INTO role_systems (guildDataId, roleRequestChannelId) VALUES(?, ?)';
          await dbExecute(sql, [row.guildDataId, channel.id]);
          await channel.send('The following roles are available on this server. If you would like to be ' +
              'assigned a role, please click the button with the indicated emoji. ' +
              'Remember, with great power comes great responsibility.');
          return interaction.followUp({
            content: 'Role system enabled.',
            flags: MessageFlags.Ephemeral,
          });
        }).catch((e) => {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the role system could not be created.\n'));
        });
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-system-disable')
        .setDescription('Disable the role request system in this server. Keeps the channel, but it cannot be used again.')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(0),
      async execute(interaction) {
        let sql = `SELECT rs.id FROM role_systems rs
                    JOIN guild_data gd ON rs.guildDataId = gd.id
                    WHERE gd.guildId=?`;
        const roleSystem = await dbQueryOne(sql, [interaction.guildId]);
        if (!roleSystem) {
          // If the role system does not exist, there is no need to attempt to delete it
          return interaction.reply({
            content: 'The role system is not currently installed on this server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          // Loop over the role categories and delete them
          sql = 'SELECT id FROM role_categories WHERE roleSystemId=?';
          const roleCategories = await dbQueryAll(sql, [roleSystem.id]);

          for (let roleCategory of roleCategories) {
            // Loop over the roles in each category and remove them from the DB
            await dbExecute('DELETE FROM roles WHERE categoryId=?', [roleCategory.id]);
          }
          await dbExecute('DELETE FROM role_categories WHERE roleSystemId=?', [roleSystem.id]);
          await dbExecute('DELETE FROM role_systems WHERE id=?', [roleSystem.id]);

          return interaction.reply('Role system disabled.');
        } catch (e) {
          console.error(e);
          return interaction.reply({
            content: replyError('Something went wrong and the role system could not be destroyed.\n'),
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    },
    {
      longDescription: 'Create a category for roles to be added to. Each category will have its own message ' +
        'in the #role-request channel.',
      commandBuilder: new SlashCommandBuilder()
        .setName('role-category-create')
        .setDescription('Create a role category.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the new category')
          .setMaxLength(categoryNameMaxLen)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');

        let sql = `SELECT rs.id, rs.roleRequestChannelId
                   FROM role_systems rs
                   JOIN guild_data gd ON rs.guildDataId=gd.id
                   WHERE gd.guildId=?`;
        const roleSystem = await dbQueryOne(sql, [interaction.guildId]);
        if (!roleSystem) {
          return interaction.reply({
            content: 'The role system has not been setup on this server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        sql = `SELECT 1 FROM role_categories rc
               JOIN role_systems rs ON rc.roleSystemId = rs.id
               JOIN guild_data gd ON rs.guildDataId = gd.id
               WHERE gd.guildId=?
                 AND rc.categoryName=?`;
        const row = await dbQueryOne(sql, [interaction.guildId, categoryName]);
        if (row) {
          return interaction.reply({
            content: 'That role category already exists!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Add the category message to the #role-request channel
          interaction.guild.channels.resolve(roleSystem.roleRequestChannelId).send('Creating new category...')
            .then(async (categoryMessage) => {
              // Update database with new category message data
              let sql = 'INSERT INTO role_categories (roleSystemId, categoryName, messageId) VALUES (?, ?, ?)';
              await dbExecute(sql, [roleSystem.id, categoryName, categoryMessage.id]);
              await updateCategoryMessage(interaction.client, interaction.guild, categoryMessage.id);
              return interaction.followUp(`Created role category: ${categoryName}.`);
            });
        } catch (e) {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the role category could not be created.\n'));
        }
      }
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-category-rename')
        .setDescription('Change the name of a role category.')
        .addStringOption((opt) => opt
          .setName('old-name')
          .setDescription('Current name of the category you wish to rename')
          .setMaxLength(categoryNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .addStringOption((opt) => opt
          .setName('new-name')
          .setDescription('New name of the category')
          .setMaxLength(categoryNameMaxLen)
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction){
        const oldName = interaction.options.getString('old-name');
        const newName = interaction.options.getString('new-name');

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Find a matching role category
          let sql = `SELECT rc.id, rc.messageId
                     FROM guild_data gd
                     JOIN role_systems rs ON rs.guildDataId = gd.id
                     JOIN role_categories rc ON rc.roleSystemId = rs.id
                     WHERE gd.guildId=?
                       AND rc.categoryName=?`;
          const categoryData = await dbQueryOne(sql, [interaction.guildId, oldName]);
          if (!categoryData) {
            return interaction.followUp('That role category does not exist!');
          }

          await dbExecute('UPDATE role_categories SET categoryName=? WHERE id=?', [newName, categoryData.id]);
          await updateCategoryMessage(interaction.client, interaction.guild, categoryData.messageId);
          return interaction.followUp(`Role category renamed from ${oldName} to ${newName}.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the role category could not be renamed.\n'));
        }
      },
      autocomplete: async (interaction) => await autocompleteCategory(interaction, name = 'old-name')
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-category-remove')
        .setDescription('Remove a role category from the role system. Keeps the roles inside of the category.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category you wish to remove')
          .setMaxLength(categoryNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');

        // Get the role category data
        let sql = `SELECT rc.id, rc.messageId, rs.roleRequestChannelId
                   FROM role_categories rc
                   JOIN role_systems rs ON rc.roleSystemId = rs.id
                   JOIN guild_data gd ON rs.guildDataId = gd.id
                   WHERE gd.guildId=?
                     AND rc.categoryName=?`;
        const roleCategory = await dbQueryOne(sql, [interaction.guildId, categoryName]);
        if (!roleCategory) {
          return interaction.reply({
            content: 'That category does not exist!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          await dbExecute('DELETE FROM roles WHERE categoryId=?', [roleCategory.id]);
          await dbExecute('DELETE FROM role_categories WHERE id=?', [roleCategory.id]);
          const roleRequestChannel = interaction.guild.channels.resolve(roleCategory.roleRequestChannelId);
          if (roleRequestChannel) {
            const categoryMessage = roleRequestChannel.messages.resolve(roleCategory.messageId);
            if (categoryMessage) { await categoryMessage.delete(); }
          }
          return interaction.followUp(`Role category ${categoryName} deleted.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the role category could not be deleted.\n'));
        }
      },
      autocomplete: autocompleteCategory
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-category-refresh')
        .setDescription('Refresh a role category. Useful if you have edited a role in it.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category to refresh')
          .setMaxLength(categoryNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');

        try {
          // Get the role category data
          let sql = `SELECT rc.messageId
                     FROM role_categories rc
                     JOIN role_systems rs ON rc.roleSystemId = rs.id
                     JOIN guild_data gd ON rs.guildDataId = gd.id
                     WHERE gd.guildId=?
                       AND rc.categoryName=?`;
          const roleCategory = await dbQueryOne(sql, [interaction.guildId, categoryName]);
          if (!roleCategory) {
            return interaction.reply({
              content: 'That category does not exist!',
              flags: MessageFlags.Ephemeral,
            });
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          await updateCategoryMessage(interaction.client, interaction.guild, roleCategory.messageId);
          await interaction.followUp({
            content: `Category ${categoryName} has been refreshed.`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (e) {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the role category could not be deleted.\n'));
        }
      },
      autocomplete: autocompleteCategory
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-add')
        .setDescription('Add a role to a role category. Can be used on a current role to edit it.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('The category your new role should be placed into')
          .setMaxLength(categoryNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('The role to be added')
          .setRequired(true))
        .addStringOption((opt) => opt
          .setName('reaction')
          .setDescription('The emoji you wish to associate with this role')
          .setRequired(false))
        .addStringOption((opt) => opt
          .setName('description')
          .setDescription('An optional description to associate with the role')
          .setMaxLength(categoryDescMaxLen)
          .setRequired(false))
        .addIntegerOption((opt) => opt
          .setName('position')
          .setDescription('Position in the category to place the role')
          .setMinValue(1)
          .setMaxValue(12)
          .setRequired(false))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const role = interaction.options.getRole('role');
        const reaction = interaction.options.getString('reaction', false);
        const description = interaction.options.getString('description', false) ?? null;
        const position = interaction.options.getInteger('position', false);

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          let emoji = null;
          if (reaction) {
            // Verify the requested emoji is available on this server
            emoji = await parseEmoji(interaction.guild, reaction, true);
            if (!emoji) {
              return interaction.followUp({
                content: 'That emoji is not available on this server!',
                flags: MessageFlags.Ephemeral,
              });
            }
          }

          // Verify the requested category exists
          let sql = `SELECT rc.id, rc.messageId, rs.roleRequestChannelId FROM role_categories rc
                     JOIN role_systems rs ON rc.roleSystemId = rs.id
                     JOIN guild_data gd ON rs.guildDataId = gd.id
                     WHERE gd.guildId=?
                       AND rc.categoryName=?`;
          const roleCategory = await dbQueryOne(sql, [interaction.guildId, categoryName]);
          // If there is no such category, warn the user and do nothing
          if (!roleCategory) {
            return interaction.followUp('That category doesn\'t exist!');
          }

          // Check for existing role
          sql = `SELECT position FROM roles r
                 JOIN role_categories rc ON r.categoryId = rc.id
                 JOIN role_systems rs ON rc.roleSystemId = rs.id
                 JOIN guild_data gd ON rs.guildDataId = gd.id
                 WHERE gd.guildId=?
                   AND rc.categoryName=?
                   AND r.roleId=?`;
          const oldPos = await dbQueryOne(sql, [interaction.guildId, categoryName, role.id]);
          const newRole = !oldPos;

          // Prevent adding more than twelve roles in a single category
          sql = `SELECT COUNT(*) AS count
                 FROM roles r
                 JOIN role_categories rc ON r.categoryId = rc.id
                 JOIN role_systems rs ON rc.roleSystemId = rs.id
                 JOIN guild_data gd ON rs.guildDataId = gd.id
                 WHERE gd.guildId=?
                   AND rc.categoryName=?`;
          // Result is string
          const roleCount = parseInt((await dbQueryOne(sql, [interaction.guildId, categoryName])).count);

          if (position && position > roleCount + newRole) {
            return interaction.followUp({
              content: 'Role position out of range.',
              flags: MessageFlags.Ephemeral,
            })
          }

          if (newRole) {
            if (roleCount >= 12) {
              return interaction.followUp({
                content: 'A role category may not exceed twelve (12) roles.',
                flags: MessageFlags.Ephemeral,
              });
            }

            if (!emoji) {
              return interaction.followUp({
                content: 'Must set reaction for new role.',
                flags: MessageFlags.Ephemeral,
              });
            }

            // It doesn't appear there's a way to easily make a transaction to prevent positions from going out of sync
            if (position) {
              await dbExecute(
                'UPDATE roles SET position=position + 1 WHERE categoryId=? AND position>=?', [roleCategory.id, position]
              );
            }
            await dbExecute(
              'INSERT INTO roles (categoryId, roleId, reaction, description, position) VALUES (?, ?, ?, ?, ?)',
              [roleCategory.id, role.id, emoji.toString(), description, position ?? roleCount + 1]
            );
          } else {
            if (position) {
              if (position < oldPos.position) {
                const sql = 'UPDATE roles SET position=position + 1 WHERE categoryId=? AND position>=? AND position<?';
                await dbExecute(sql, [roleCategory.id, position, oldPos.position]);
              } else if (position > oldPos.position) {
                const sql = 'UPDATE roles SET position=position - 1 WHERE categoryId=? AND position>? AND position<=?';
                await dbExecute(sql, [roleCategory.id, oldPos.position, position]);
              }
            }

            // Update the given role fields
            const sql = `UPDATE roles SET
                         reaction=COALESCE(?, reaction),
                         description=COALESCE(?, description),
                         position=COALESCE(?, position)
                       WHERE roles.roleId=?`
            await dbExecute(sql, [emoji?.toString() ?? null, description, position, role.id]);
          }

          await updateCategoryMessage(interaction.client, interaction.guild, roleCategory.messageId);
          return interaction.followUp(`Added ${role} to the ${categoryName} category.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the role could not be added.\n'));
        }
      },
      autocomplete: autocompleteCategory
    },
    {
      commandBuilder: new SlashCommandBuilder()
        .setName('role-remove')
        .setDescription('Remove a role from a given role category.')
        .addStringOption((opt) => opt
          .setName('category-name')
          .setDescription('Name of the category containing the target role')
          .setMaxLength(categoryNameMaxLen)
          .setRequired(true)
          .setAutocomplete(true))
        .addRoleOption((opt) => opt
          .setName('role')
          .setDescription('Role to remove from category')
          .setRequired(true))
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute(interaction) {
        const categoryName = interaction.options.getString('category-name');
        const role = interaction.options.getRole('role');

        const sql = `SELECT r.id, rc.id AS categoryId, r.position, rc.messageId
                     FROM roles r
                     JOIN role_categories rc ON r.categoryId = rc.id
                     JOIN role_systems rs ON rc.roleSystemId = rs.id
                     JOIN guild_data gd ON rs.guildDataId = gd.id
                     WHERE gd.guildId=?
                       AND rc.categoryName=?
                       AND r.roleId=?`;
        const roleData = await dbQueryOne(sql, [interaction.guildId, categoryName, role.id]);
        if (!roleData) {
          return interaction.reply({
            content: 'That role does not exist in this guild/category!',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          await dbExecute(
            'UPDATE roles SET position=position - 1 WHERE categoryId=? AND position>?',
            [roleData.categoryId, roleData.position]
          );

          // Delete rows from the roles table and update role category message
          await dbExecute('DELETE FROM roles WHERE id=? AND categoryId=?', [roleData.id, roleData.categoryId]);
          await updateCategoryMessage(interaction.client, interaction.guild, roleData.messageId);
          return interaction.followUp(`Removed role ${role.name} from category ${categoryName}.`);
        } catch (e) {
          console.error(e);
          return interaction.followUp(replyError('Something went wrong and the role could not be removed.\n'));
        }
      },
      autocomplete: autocompleteCategory
    },
  ],
};
