import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        post: resolve(__dirname, 'post.html'),
        create_post: resolve(__dirname, 'create_post.html'),
        login: resolve(__dirname, 'admin/login.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        admin_posts: resolve(__dirname, 'admin/posts.html'),
        admin_comments: resolve(__dirname, 'admin/comments.html'),
        admin_edit: resolve(__dirname, 'admin/edit_post.html'),
        user_login: resolve(__dirname, 'login.html'),
        register: resolve(__dirname, 'register.html'),
        stories: resolve(__dirname, 'stories.html'),
        create_story: resolve(__dirname, 'create_story.html'),
        story_detail: resolve(__dirname, 'story_detail.html'),
        messages: resolve(__dirname, 'messages.html'),
        notifications: resolve(__dirname, 'notifications.html'),
        feed: resolve(__dirname, 'feed.html'),
        collections: resolve(__dirname, 'collections.html'),
        collection: resolve(__dirname, 'collection.html'),
        create_collection: resolve(__dirname, 'create_collection.html'),
        admin_collections: resolve(__dirname, 'admin/collections.html'),
        admin_tickets: resolve(__dirname, 'admin/tickets.html'),
        feedback: resolve(__dirname, 'feedback.html'),
      }
    }
  }
})
