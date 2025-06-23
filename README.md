# AI Chat Application

A full-stack AI chatbot application built with Next.js 15, Anthropic Claude, and Composio integration.

## Tech Stack

- **Next.js 15** - App Router with React Server Components
- **AI SDK** - Anthropic Claude integration (claude-4-sonnet)
- **Composio** - Third-party app integrations (300+ apps)
- **Drizzle ORM** - PostgreSQL database
- **Auth.js** - Authentication system
- **shadcn/ui** - UI components with Tailwind CSS

## Features

- Real-time AI chat with Claude models
- Multiple artifact types (code, documents, images, spreadsheets)
- File upload and document processing
- Chat history with public/private visibility
- User voting and suggestions system
- Multi-modal input support
- Third-party app integrations via Composio

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- pnpm package manager

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Add your Composio API key from [app.composio.dev](https://app.composio.dev/developers)
   - Configure database connection
   - Set up authentication providers

4. Run database migrations:
   ```bash
   pnpm db:migrate
   ```

5. Start the development server:
   ```bash
   pnpm dev
   ```

## Development Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm lint` - Run linting with auto-fix
- `pnpm format` - Format code with Biome
- `pnpm test` - Run e2e tests
- `pnpm db:studio` - Open database studio

## Project Structure

```
/app/(auth)/     - Authentication routes
/app/(chat)/     - Main chat interface
/artifacts/      - Artifact type components
/components/     - Reusable UI components
/lib/ai/         - AI model configuration
/lib/db/         - Database schema
/hooks/          - Custom React hooks
/tests/          - Playwright tests
```

## Composio Integration

This app integrates with Composio to provide access to 300+ third-party applications. Users can connect their accounts and use them as tools within the chat interface.

For Composio documentation, see `composio-docs.md`.

## Contributing

Please refer to `CLAUDE.md` for development guidelines and best practices.

## License

MIT