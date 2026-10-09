---
description: Frontend development standards, best practices, and conventions for the LTI React application including component patterns, state management, UI/UX guidelines, and testing practices
globs: ["frontend/src/**/*.{js,jsx,ts,tsx}", "frontend/cypress/**/*.{ts,js}", "frontend/tsconfig.json", "frontend/vite.config.ts", "frontend/cypress.config.ts", "frontend/package.json"]
alwaysApply: true
---

# Frontend Project Configuration and Best Practices

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
  - [Core Technologies](#core-technologies)
  - [UI Framework](#ui-framework)
  - [State Management & Data Flow](#state-management--data-flow)
  - [Testing Framework](#testing-framework)
  - [Development Tools](#development-tools)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
  - [Language and Naming Conventions](#language-and-naming-conventions)
  - [Component Conventions](#component-conventions)
  - [React 19 Conventions](#react-19-conventions)
  - [State Management](#state-management)
  - [Service Layer Architecture](#service-layer-architecture)
- [UI/UX Standards](#uiux-standards)
  - [Bootstrap Integration](#bootstrap-integration)
  - [Form Handling](#form-handling)
  - [Navigation Patterns](#navigation-patterns)
  - [Accessibility](#accessibility)
- [Testing Standards](#testing-standards)
  - [Unit and Component Testing with Vitest](#unit-and-component-testing-with-vitest)
  - [End-to-End Testing with Cypress](#end-to-end-testing-with-cypress)
  - [Test Organization](#test-organization)
- [Configuration Standards](#configuration-standards)
  - [TypeScript Configuration](#typescript-configuration)
  - [ESLint Configuration](#eslint-configuration)
  - [Environment Configuration](#environment-configuration)
- [Performance Best Practices](#performance-best-practices)
  - [Component Optimization](#component-optimization)
  - [Bundle Optimization](#bundle-optimization)
  - [API Efficiency](#api-efficiency)
- [Development Workflow](#development-workflow)
  - [Git Workflow](#git-workflow)
  - [Development Scripts](#development-scripts)
  - [Code Quality](#code-quality)
- [Migration Strategy](#migration-strategy)
  - [TypeScript Migration](#typescript-migration)
  - [Component Modernization](#component-modernization)

---

## Overview

This document outlines the best practices, conventions, and standards used in the LTI frontend application. These practices ensure code consistency, maintainability, and optimal development experience.

## Technology Stack

### Core Technologies
- **React 19** (`react`, `react-dom`): functional components, hooks, Actions and the `use` API. See [React 19 Conventions](#react-19-conventions)
- **TypeScript 6.0** (`~6.0`): For type safety and better development experience (strict mode). The root `package.json` pins it for the whole tree with `"overrides": { "typescript": "~6.0.3" }`, because some tools (e.g. `openapi-typescript`) still declare only TypeScript 5 as a peer dependency; keep the override in sync with the workspaces' `typescript` version
- **Vite**: Build tooling and development server (Create React App is deprecated and must not be used)
- **React Router 8** (`react-router` package): client-side routing and navigation. Import everything from `react-router`; the legacy `react-router-dom` package must not be added

### UI Framework
- **Bootstrap 5.3**: CSS framework for responsive design
- **React Bootstrap 2.10**: Bootstrap components for React (compatible with React 19)
- **React Bootstrap Icons 1.11**: Icon library
- **React DatePicker 9**: Date input components (versions below 7 do not support React 19)

### State Management & Data Flow
- **React Hooks**: `useState`, `useReducer` and custom hooks for local state; `useActionState` and `useOptimistic` for form submissions
- **React Context + `use`**: shared state that does not justify a global store (e.g. authenticated session)
- **@hello-pangea/dnd 18**: Drag and drop functionality. `react-beautiful-dnd` is deprecated, does not support React 19 and must not be used
- **Axios**: HTTP client for API communication

Before adding or upgrading a dependency, check that its `peerDependencies` accept React 19 (`npm view <package> peerDependencies`).

### Testing Framework
- **Cypress 16.1.1**: End-to-end testing
- **Vitest**: Unit and component testing (shares the Vite configuration, `jsdom` environment). **Coverage threshold: 80%** for branches, functions, lines and statements
- **React Testing Library 16+**: Component testing utilities with React 19 support (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` matchers)
- **axe-core**: Automated WCAG 2.1 AA checks of rendered pages in Vitest (`*.a11y.test.tsx`); run it with the `color-contrast` rule disabled, because jsdom cannot measure contrast

### Development Tools
- **ESLint**: Code linting with React-specific rules
- **Prettier**: Code formatting, applied on commit by husky + lint-staged
- **react-i18next**: Internationalization (`es.json`, `en.json`); components use `t('...')` for every user-facing text
- **TypeScript**: Static type checking
- **Web Vitals**: Performance monitoring

## Project Structure

```
frontend/
├── public/                 # Static assets
├── index.html             # Vite HTML entry point
├── src/
│   ├── api/
│   │   └── generated/    # API types generated from docs/api-spec.yml (never edited by hand)
│   ├── components/        # Reusable UI components
│   ├── services/         # API service layer
│   ├── pages/           # Page components
│   ├── assets/          # Images, fonts, static resources
│   ├── i18n/            # Translation resources (es.json, en.json)
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Application entry point
│   ├── setupTests.ts    # Vitest global setup (jest-dom matchers)
│   └── index.css        # Global styles
├── cypress/
│   └── e2e/            # End-to-end test files
├── package.json         # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── vite.config.ts      # Vite and Vitest configuration
└── cypress.config.ts   # Cypress configuration
```

## Coding Standards

### Language and Naming Conventions

Language policy (canonical rule in `docs/base-standards-castellano.md` §1):
- **English** for everything that is code: identifiers, file names, i18n keys, error codes and test names
- **Spanish (castellano)** for comments, JSDoc, documentation, commit messages and console/log messages
- **User-facing text** always through i18n (`es.json`, `en.json`), never hardcoded in components

- **Component Naming**: Use PascalCase for React components (e.g., `CandidateCard`, `PositionDetails`, `RecruiterDashboard`)
- **Variable Naming**: Use camelCase for variables and functions (e.g., `candidateId`, `handleSubmit`, `fetchPositions`)
- **Constants Naming**: Use UPPER_SNAKE_CASE for constants (e.g., `MAX_CANDIDATES_PER_PAGE`, `API_BASE_URL`)
- **Type/Interface Naming**: Use PascalCase for types and interfaces (e.g., `CandidateData`, `PositionProps`, `ICandidateService`)
- **File Naming**: Use PascalCase for component files (e.g., `CandidateCard.tsx`, `PositionDetails.tsx`) and camelCase for utility files (e.g., `candidateService.js`, `apiUtils.ts`)
- **CSS Class Naming**: Use kebab-case for CSS classes (e.g., `candidate-card`, `position-details`)
- **Hook Naming**: Use camelCase starting with "use" prefix (e.g., `useCandidate`, `usePositionData`, `useFormValidation`)

**Examples:**

```typescript
// Good: English identifiers, Spanish comments
import { useState } from 'react';

type CandidateCardProps = {
    candidate: Candidate;
    index: number;
    onClick: (candidate: Candidate) => void;
};

function CandidateCard({ candidate, index, onClick }: CandidateCardProps) {
    const [isLoading, setIsLoading] = useState(false);
    
    // Notifica al padre qué candidato se ha seleccionado
    const handleCardClick = () => {
        onClick(candidate);
    };
    
    return (
        <div className="candidate-card" onClick={handleCardClick}>
            {/* Component JSX */}
        </div>
    );
}

// Avoid: Spanish identifiers (and English comments)
function TarjetaCandidato({ candidato, indice, alHacerClic }: PropsTarjetaCandidato) {
    const [estaCargando, setEstaCargando] = useState(false);
    
    // Manejar evento de clic en la tarjeta de candidato
    const manejarClicTarjeta = () => {
        alHacerClic(candidato);
    };
    
    return (
        <div className="tarjeta-candidato" onClick={manejarClicTarjeta}>
            {/* JSX del componente */}
        </div>
    );
}
```

**Error Messages and Console Logs:**

```typescript
// Good: user-facing text through i18n, console message in Spanish
catch (error) {
    console.error('Error al obtener los candidatos:', error);
    setError(t('candidates.errors.loadFailed'));
}

// Avoid: hardcoded user-facing text (in any language)
catch (error) {
    console.error('Error al obtener los candidatos:', error);
    setError('No se pudieron cargar los candidatos. Por favor, inténtelo de nuevo más tarde.');
}
```

**Service Layer Examples:**

```typescript
// Good: English naming in services, Spanish log messages
export const candidateService = {
    getAllCandidates: async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/candidates`);
            return response.data;
        } catch (error) {
            console.error('Error al obtener los candidatos:', error);
            throw error;
        }
    }
};

// Avoid: Spanish identifiers
export const servicioCandidatos = {
    obtenerTodosLosCandidatos: async () => {
        try {
            const respuesta = await axios.get(`${API_BASE_URL}/candidates`);
            return respuesta.data;
        } catch (error) {
            console.error('Error al obtener candidatos:', error);
            throw error;
        }
    }
};
```

### Component Conventions

#### Functional Components
- **Always use functional components** with hooks instead of class components (error boundaries are covered by `react-error-boundary`, see below)
- **All components are written in TypeScript** (`.tsx`); there is no legacy JavaScript in this project
- Declare components as plain functions with typed props; **do not use `React.FC`**
- The new JSX transform is used: **do not `import React`** just to write JSX

```typescript
// Preferred - TypeScript functional component
import { useState } from 'react';

type Position = {
    id: number;
    title: string;
    status: 'Open' | 'Contratado' | 'Cerrado' | 'Borrador';
};

function Positions() {
    const [positions, setPositions] = useState<Position[]>([]);
    // Component logic
}
```

#### Component Props
- **Define TypeScript types** for component props
- Use **destructuring** for props
- Set **default values with default parameters**: `defaultProps` and `propTypes` are not supported for function components in React 19

```typescript
type CandidateCardProps = {
    candidate: Candidate;
    index: number;
    variant?: 'compact' | 'full';
    onClick: (candidate: Candidate) => void;
};

function CandidateCard({ candidate, index, variant = 'full', onClick }: CandidateCardProps) {
    // Component implementation
}
```

### React 19 Conventions

#### Application Entry Point
- Mount the app with `createRoot` inside `<StrictMode>` in `src/main.tsx`; `ReactDOM.render` and `ReactDOM.hydrate` no longer exist
- Use the root error callbacks (`onUncaughtError`, `onCaughtError`) to send errors to the logger instead of relying on `console.error`

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!, {
    onUncaughtError: (error, errorInfo) => logError(error, errorInfo),
}).render(
    <StrictMode>
        <App />
    </StrictMode>
);
```

#### Refs
- Pass `ref` as a regular prop; **do not use `forwardRef`** (deprecated in React 19)
- `useRef` always receives an initial value (`useRef<HTMLInputElement>(null)`)
- Ref callbacks may return a cleanup function; do not return anything else from them

```typescript
type TextFieldProps = {
    label: string;
    ref?: React.Ref<HTMLInputElement>;
};

function TextField({ label, ref }: TextFieldProps) {
    return <Form.Control aria-label={label} ref={ref} />;
}
```

#### Context
- Render the context directly as provider (`<SessionContext value={session}>`); `<Context.Provider>` is deprecated
- Read context with `use(SessionContext)`; unlike `useContext`, `use` can be called conditionally

#### Forms and Actions
- Use **Actions** for submissions: `useActionState` for the result and errors of the submission, `useFormStatus` to disable buttons while pending, and `useOptimistic` for optimistic updates
- Keep **controlled inputs** when the form needs real-time inline validation or must preserve its values (e.g. persisting draft data in `sessionStorage`). React resets uncontrolled fields after a successful `<form action>`
- Validation errors returned by the action are shown inline under each field (see [Accessibility](#accessibility))

```typescript
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

type RegisterState = { fieldErrors: Record<string, string>; formError?: string };

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? t('common.saving') : t('common.save')}
        </Button>
    );
}

function RegisterForm() {
    const [state, submitAction] = useActionState<RegisterState, FormData>(registerUser, { fieldErrors: {} });
    return (
        <Form action={submitAction}>
            {/* fields, with state.fieldErrors shown inline */}
            <SubmitButton />
        </Form>
    );
}
```

#### Data Loading
- Load server data through **service functions** wrapped in **custom hooks** (e.g. `useCourses`); components do not call Axios directly
- `use(promise)` with `<Suspense>` is allowed only for promises created outside render and cached (never a promise created in the component body)
- Always cancel or ignore stale requests in effects (`AbortController`)

#### Document Metadata
- Set per-page `<title>` and `<meta>` tags directly inside page components; React 19 hoists them to `<head>`

#### Error Boundaries
- Wrap each route in an error boundary that shows a user-friendly message; use the `react-error-boundary` package instead of writing class components

#### Types
- Use `@types/react` 19: reference JSX types as `React.JSX.Element`; the global `JSX` namespace is no longer available
- Declare `children: React.ReactNode` explicitly in props when a component accepts children

### State Management

#### Local State with Hooks
- Use **useState** (or `useReducer` for complex state) for component-level state
- Use **useEffect** only to synchronize with external systems; do not use it to derive state that can be computed during render
- **Extract custom hooks** for reusable stateful logic and data loading (see [Data Loading](#data-loading))

```javascript
const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'Borrador'
});

const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
        ...prev,
        [name]: value
    }));
};
```

#### Loading and Error States
- **Always handle loading states** for async operations
- **Implement error handling** with user-friendly messages
- **Use React Bootstrap Alert** components for feedback

```javascript
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [success, setSuccess] = useState('');

// In async function
try {
    setLoading(true);
    const data = await apiCall();
    setSuccess('Operation completed successfully');
} catch (error) {
    setError('Error message: ' + error.message);
} finally {
    setLoading(false);
}
```

### Service Layer Architecture

#### API Services
- **Centralize API calls** in service files
- Use **axios** for HTTP requests
- **Export service objects** with grouped methods
- **Handle errors at service level** when appropriate

```javascript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3010';

export const positionService = {
    getAllPositions: async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/positions`);
            return response.data;
        } catch (error) {
            console.error('Error fetching positions:', error);
            throw error;
        }
    },
    
    updatePosition: async (id, positionData) => {
        try {
            const response = await axios.put(`${API_BASE_URL}/positions/${id}`, positionData);
            return response.data;
        } catch (error) {
            console.error('Error updating position:', error);
            throw error;
        }
    }
};
```

#### API Types
- **Never write API request/response types (DTOs) by hand.** Import them from `src/api/generated/schema.ts`, which `openapi-typescript` generates from the API contract `docs/api-spec.yml`
- **Change the contract first**, then regenerate: `npm run api:types -w frontend`. Commit the regenerated file together with the contract change
- CI runs `npm run api:types:check -w frontend` and fails if the generated file is not up to date with the contract
- The generated file is excluded from ESLint, Prettier and coverage: its content must be exactly the generator's output
- Translate errors by `error.code` (and, for `VALIDATION_ERROR`, by each `details[].field` and `details[].code`) through i18n; never show `error.message` to the user

```typescript
import type { components } from '../api/generated/schema';

type RegisterRequest = components['schemas']['RegisterRequest'];
type FieldError = components['schemas']['FieldError'];
```

## UI/UX Standards

### Bootstrap Integration
- Use **React Bootstrap components** instead of plain Bootstrap
- **Import Bootstrap CSS** in the main App component
- Follow **Bootstrap responsive grid system** (Container, Row, Col)

```javascript
import { Container, Row, Col, Card, Button, Form, Alert } from 'react-bootstrap';
```

### Form Handling
- Submit forms with **Actions** (`useActionState`, `useFormStatus`), see [Forms and Actions](#forms-and-actions)
- Use **controlled components** when real-time validation or value persistence is required
- Implement **real-time validation** where appropriate
- **Disable submit buttons** while the action is pending
- **Clear form state** after successful submission

```javascript
<Form onSubmit={handleSubmit}>
    <Form.Group className="mb-3">
        <Form.Label>Title *</Form.Label>
        <Form.Control
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            required
        />
    </Form.Group>
    <Button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
    </Button>
</Form>
```

### Navigation Patterns
- Use **React Router** for all navigation
- **Implement breadcrumbs** with back navigation
- Use **programmatic navigation** with useNavigate hook

```javascript
import { useNavigate } from 'react-router';

const navigate = useNavigate();

// Navigation examples
<Button variant="link" onClick={() => navigate('/')}>
    ← Back to Dashboard
</Button>
```

### Accessibility
- Include **aria-label** attributes for interactive elements
- Use **semantic HTML** elements
- Ensure **keyboard navigation** support
- Provide **alternative text** for images
- Show field errors **inline under the field**, with `role="alert"` on the message, `aria-invalid="true"` on the field and `aria-describedby` pointing to the message; move focus to the first invalid field when a submit is rejected
- Build selectors that only accept items from a list (e.g. a municipality search) as an **ARIA combobox** with a listbox, keyboard support (arrows, Enter, Escape) and no free-text selection
- Cover every new page with an axe test for its states (initial, with errors, with an open list, with a load failure, confirmation)

```javascript
<Form.Control 
    type="text" 
    placeholder="Search by title" 
    aria-label="Search positions by title"
/>
```

## Testing Standards

### Unit and Component Testing with Vitest
- Use **Vitest** with the `jsdom` environment, configured in `vite.config.ts` (`test` block); do not add a separate Jest configuration
- Place test files next to the code they test: `[ComponentName].test.tsx`
- Use **React Testing Library** queries by role and label (`getByRole`, `getByLabelText`) to test behavior as the user sees it, not implementation details
- Simulate interactions with `@testing-library/user-event`
- Mock modules with `vi.mock()` and functions with `vi.fn()`; restore them in `afterEach` with `vi.restoreAllMocks()`
- Register `@testing-library/jest-dom` matchers in `src/setupTests.ts`
- Import `act` from `react` when needed (`react-dom/test-utils` was removed in React 19); prefer RTL's async utilities (`findBy*`, `waitFor`)
- Test Actions through the UI: submit the form and assert on the pending state and the rendered result

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

describe('SubmitButton', () => {
    it('should call onSubmit when clicked', async () => {
        // Arrange
        const onSubmit = vi.fn();
        render(<SubmitButton onSubmit={onSubmit} />);

        // Act
        await userEvent.click(screen.getByRole('button', { name: /enviar/i }));

        // Assert
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});
```

### End-to-End Testing with Cypress
- **Test user workflows** rather than implementation details
- Use **data-testid** attributes for reliable element selection
- **Organize tests by feature** (candidates.cy.ts, positions.cy.ts)
- **Include API testing** alongside UI testing

```typescript
describe('Positions API - Update', () => {
    beforeEach(() => {
        cy.window().then((win) => {
            win.localStorage.clear();
        });
    });

    it('should update a position successfully', () => {
        const updateData = {
            title: 'Updated Test Position',
            status: 'Open'
        };

        cy.request({
            method: 'PUT',
            url: `${API_URL}/positions/${testPositionId}`,
            body: updateData
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.data.title).to.eq(updateData.title);
        });
    });
});
```

### Test Organization
- **Group related tests** with describe blocks
- **Use descriptive test names** that explain the expected behavior
- **Test both success and error scenarios**
- **Include edge cases** and validation testing

## Configuration Standards

### TypeScript Configuration
- Enable **strict mode** for type checking
- Use **path mapping** with "@/*" for cleaner imports
- **Keep Cypress types out of the app tsconfig**: Cypress (Mocha/Chai) and Vitest declare the same globals (`describe`, `it`, `expect`). The app `tsconfig.json` excludes `cypress/`, and `cypress/tsconfig.json` declares `"types": ["cypress", "node"]`
- **Vitest runs without globals** (`globals: false`): tests import `describe`, `it` and `expect` from `vitest`, and `setupTests.ts` registers React Testing Library's `cleanup` explicitly
- Configure **ES2022 target** (modern browsers supported by Vite)

```json
// frontend/tsconfig.json (app + Vitest tests)
{
    "compilerOptions": {
        "strict": true,
        "baseUrl": ".",
        "paths": {
            "@/*": ["src/*"]
        },
        "types": ["vite/client"]
    },
    "include": ["src", "vite.config.ts", "cypress.config.ts"],
    "exclude": ["cypress", "dist", "node_modules"]
}

// frontend/cypress/tsconfig.json (Cypress specs only)
{
    "compilerOptions": { "strict": true, "types": ["cypress", "node"] },
    "include": ["**/*.ts"]
}
```

### ESLint Configuration
- Use the ESLint **flat config** with TypeScript, `eslint-plugin-react-hooks` (recommended rules for React 19) and `eslint-plugin-react-refresh`
- Include **Vitest rules** for test files
- **Automatic code formatting** and error detection
- **Consistent code style** across the project

### Environment Configuration
- Call the API through the relative `/api` prefix; in development the **Vite proxy** forwards `/api/*` to the backend, so frontend and API share origin (no CORS, same cookie behavior as production)
- **Keep the session in memory only**: the access token and the user live in React state (`SessionProvider`), never in `localStorage`, `sessionStorage` or a cookie readable by JavaScript. The refresh token travels in an `HttpOnly` cookie that only the server reads; the app gets the access token with `POST /api/auth/refresh` (`credentials: 'same-origin'`) once at startup and after a sign-up
- Use **environment variables** (`import.meta.env.VITE_*`) only for values that really differ per environment
- **Separate configurations** for development and production
- The Vite proxy target comes from `API_PROXY_TARGET` (default `http://localhost:3000`); `vite preview` inherits the same proxy, so E2E tests also call the API through the relative `/api` prefix
- **Cypress runs against the production build** served by `vite preview` (port 4173), never against the dev server

```javascript
// cypress.config.ts
export default defineConfig({
    e2e: {
        baseUrl: 'http://localhost:4173', // vite preview; /api goes through its proxy
        specPattern: 'cypress/e2e/**/*.cy.ts',
        supportFile: false,
    },
});
```

## Performance Best Practices

### Component Optimization
- **Lazy load** components when appropriate
- **Do not add `useMemo`, `useCallback` or `memo` by default**: use them only when profiling shows a measurable problem (the React Compiler is not enabled in this project)
- **Extract reusable logic** into custom hooks

### Bundle Optimization
- **Tree shaking** enabled through the Vite production build
- **Code splitting** at route level
- **Optimize images** and static assets
- **Monitor bundle size** with build tools

### API Efficiency
- **Implement proper error handling** for network requests
- **Cache API responses** where appropriate
- **Use loading states** to improve perceived performance
- **Batch API calls** when possible

## Development Workflow

- **Feature Branches**: Develop features in separate branches, adding descriptive suffix "-frontend" to allow working in parallel and avoid conflicts or collisions
- **Descriptive Commits**: Write descriptive commit messages in Spanish (castellano), following Conventional Commits
- **Code Review**: Code review before merging
- **Small Branches**: Keep branches small and focused

### Development Scripts
```bash
# From the repository root
npm run dev                  # Backend and Vite dev server in parallel (frontend on :5173)
npm run test -w frontend     # Unit and component tests (Vitest) with coverage (80% threshold)
npm run typecheck -w frontend  # Types of the app, its tests and the Cypress specs
npm run build -w frontend    # Production build
npm run test:e2e             # Build, start backend + vite preview and run Cypress headless (scripts/e2e.mjs)
npm exec -w frontend -- vitest run src/pages/HomePage.test.tsx  # A single test file
```

Always run Cypress headless through `npm run test:e2e`; `cypress open` is only for local debugging.

### Code Quality
- **ESLint validation** before commits
- **TypeScript compilation** without errors
- **All tests passing** before deployment
- **Performance monitoring** with Web Vitals

## Migration Strategy

### TypeScript Migration
- Not applicable: the project starts in TypeScript strict mode and does not contain JavaScript components

### Component Modernization
- **Functional components** over class components
- **Hooks and Actions** instead of lifecycle methods and manual submit state
- **No deprecated React APIs**: `forwardRef`, `<Context.Provider>`, `defaultProps` on function components, `propTypes`, string refs and `react-dom/test-utils`
- **React Bootstrap** components for consistency
- **Responsive design** principles throughout

