const { dbQueryAll } = require('../lib');

module.exports = async (client) => {
  const posts = await dbQueryAll('SELECT channelId, postId FROM pinned_forum_posts');

  let count = 0;
  for (const post of posts) {
    const channel = await client.channels.fetch(post.channelId);
    if (!channel.isThreadOnly()) {
      console.log(`Found non-forum channel ${post.channelId} in pinned posts list.`);
      continue;
    }

    const pinnedPost = await channel.threads.fetch(post.postId);
    try {
      await pinnedPost.setArchived(false, 'Open to re-pin.');
      await pinnedPost.pin('Post set to automatically re-pin.');
      count++;
    } catch (err) {
      console.log(`Could not pin post ${post.postId}.`);
      console.log(err);
    }
  }

  console.log(`Repinned ${count} of ${posts.length} attempted posts.`);
};
