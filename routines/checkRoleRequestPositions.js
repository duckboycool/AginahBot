const { dbExecute, dbQueryAll } = require('../lib');

module.exports = async (client) => {
  // This shouldn't actually do anything under normal circumstances, but just in case the positions get messed up,
  // this should make them re-sync with how they appear.
  const categories = await dbQueryAll('SELECT id FROM role_categories');

  let count = 0;
  for (const category of categories) {
    const roles = await dbQueryAll('SELECT id, position FROM roles WHERE categoryId=? ORDER BY position', [category.id]);

    let fixed = false;
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      if (i + 1 != role.position) {
        await dbExecute('UPDATE roles SET position=? WHERE id=?', [i + 1, role.id]);
        fixed = true;
        console.log(`Entry ${i + 1} of role category id ${category.id} was set to position ${role.position}`);
      }
    }

    count += fixed;
  }

  console.log(`Fixed ordering for ${count} of ${categories.length} role system categories.`);
};
