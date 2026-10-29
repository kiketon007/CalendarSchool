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
  - [Authentication Pages](#authentication-pages)
- [Testing Standards](#testing-standards)
  - [Unit and Component Testing with Vitest](#unit-and-component-testing-with-vitest)
  - [End-to-End Testing with Cypress](#end-to-end-testing-with-cypress)
  - [Test Organization](#test-organization)
- [Configuration Standards](#configuration-standards)
  - [TypeScript Configuration](#typescript-configuration)
  - [ESLint Configuration](#eslint-configuration)
  - [Environment Configuration](#environment-configuration)
  - [Content Security Policy](#content-security-policy)
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
- Keep **controlled inputs** when the form needs real-time inline validation or must preserve its values (e.g. persisting draft data in `sessionStorage`). A draft goes through one module (`services/registrationDraft.ts`) that owns the key (versioned) and the storage, lists the saved fields explicitly, **never saves passwords or tokens**, wraps every access in `try/catch` (blocked or full storage must not break the form) and treats the stored value as untrusted input (ignore anything that is not the expected shape). Prefer `sessionStorage` over `localStorage` for personal data (shared computers). Guard against repeated submits with a synchronous `ref`, since state only changes on the next render React resets uncontrolled fields after a successful `<form action>`
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

### Protected Pages

- **One layout, one session guard**: every page that needs a session is a child of the `AuthenticatedLayout` route in `App.tsx`, and public pages (`/`, `/registro`, `/login`, `/privacidad`, `/invitacion`, `/restablecer`) stay outside. The layout is the only place that guards the session: while it is `loading` it shows a `role="status"` indicator, an `anonymous` session navigates to `/login` with `replace`, and otherwise it renders `AppHeader` and the `<Outlet />`. A page does not repeat that guard (it may keep a type-narrowing `if` that returns `null`)
- **Role guard is only a convenience**: `RequireRole` (a layout route inside `AuthenticatedLayout`) sends a user with another role to `/onboarding` silently. The role in memory can lag behind the real one, and the backend always decides. A page that receives `403 FORBIDDEN` calls `refresh()` and navigates to `/onboarding` with `replace`, without a message. Show a navigation link only if the role allows the page
- **Authenticated requests go through `authorizedFetch`**: `useSession().authorizedFetch` (`session/authorizedFetch.ts`) adds `Authorization: Bearer` with the token in memory and, on `401 INVALID_SESSION`, renews the session once and repeats the request once; requests that fail at the same time share one renewal, and if another request already renewed the token the request is repeated without renewing again. Any other answer (`403`, `503`) is returned as it is and a network error reaches the caller. Never call `fetch` with the token by hand
- **Services receive the client**: `usersService.list(authorizedFetch)` returns a `UsersOutcome` (`loaded`, `forbidden`, `unauthenticated`, `unavailable`), never throws, and treats anything unknown as `unavailable`. `unauthenticated` needs no handling in the page: the layout redirects when the session becomes `anonymous`
- **Load a list once, also in strict mode**: keep the requested attempt in a `ref` and an `isMounted` `ref` (not a cleanup flag, which would drop the answer of the only request when React runs the effect twice), show a `role="status"` indicator while loading, and on failure a `role="alert"` with a "Retry" button that bumps the attempt. Render user data as plain text and format dates with the active language (`Intl.DateTimeFormat(i18n.language, ...)`)
- **Test the guards in the layout, not in each page**: `AuthenticatedLayout.test.tsx` covers loading, anonymous, session and a session lost while the page is open; a page test renders the page alone with an authenticated session

### Home Page and Features Not Yet Available

- **A feature that does not exist yet is a non-interactive block with its state in text**: never a broken link, a link to a route that answers `404`, or a disabled button (it is not focusable, some screen readers skip it and it suggests an action). `components/FeatureCard` is an `article` named by its `h3`, with the description and a `Badge` "Coming soon" (`bg="secondary"`, white on `#6c757d`, 4.69:1); it has no link, no button and nothing focusable
- **Features are data with an optional route**: `OnboardingPage` declares them as a constant list (`key`, icon, `to?`) and `FeatureCard` decides by the route: with `to` it renders a `Link` and no badge. Enabling a module is adding its `to`; the card and its test do not change
- **Icons are inline SVG components**: `components/icons/`, decorative (`aria-hidden="true"`, `focusable="false"`), no icon package and no stylesheet or font that the CSP would have to allow
- **The application name in the header is the way home**: a `NavLink` to `/onboarding`, which already sets `aria-current="page"`; do not add a second "Home" link
- **The home page stores nothing**: no choice of the user and no "already seen" flag in `localStorage`, `sessionStorage` or the server. Role-based shortcuts (the "Users" card for `ADMIN`) are a convenience read from the session; the guard and the backend decide

### Actions on Records of a List

- **Services return an outcome per action, never throw**: `usersService.changeRole`, `suspend` and `reactivate` receive `authorizedFetch` and return a `UserActionOutcome` (`updated` with the record, one status per `409` code, `notFound`, `forbidden`, `unauthenticated`, `unavailable`). They interpret the answer by `error.code`, never by the message, and anything unknown is `unavailable`
- **Guard each row with a synchronous `Set` in a `ref`**: `pendingRef` holds the ids with a request in flight and stops a double click before the next render; a state mirror only disables that row's buttons. The other rows stay available. Do not use one global `isPending`
- **Replace the row with the answer, do not reload**: a `200` returns the record as it is now, so the list is updated in place. Reload only when the server says the list was stale (`404`), and keep the rows on screen while it loads
- **Confirm only what cannot be undone with a click**: suspending closes the user's sessions, so it asks first; changing a role and reactivating do not. The confirmation is a react-bootstrap `Modal` that stays mounted and is driven by `show` (so the focus returns to the button that opened it), starts with the focus on "Cancel", and keeps the target user in state so its text does not change while it fades out. It has no close "X": its accessible name would clash with "Cancel", and Escape, "Cancel" and a click outside already close it
- **One alert for the last rejection**: each rejection shows its own message in a `role="alert"` above the table, the row stays as it was, and the alert is cleared when the next action starts. Do not use a dismissible `Alert`: its close button label comes in English from react-bootstrap
- **Do not offer what the server will refuse**: the own row has no "Suspend" and an `ACTIVE`/`SUSPENDED` state decides which buttons exist. It is only a convenience; the backend decides, and every rejection has a message anyway
- **The acting user changing their own role renews the session**: after a `200` that changes the role of the session's user the page calls `refresh()`, and `RequireRole` takes them to `/onboarding`. The page does not navigate by itself
- **Label every control with the row's context through the table, not through longer names**: identical button names in each row are fine inside a table (the row gives the context), and tests find them with `within(row)`. A button of a dialog that shares a name with row buttons is searched `within(dialog)`
- **A destructive action that cannot be undone shows what it will cost first**: the delete button opens `DeleteCourseModal`, which asks the server for the impact (`GET …/impact`), shows "Loading…" with the confirm button disabled, then the counts and "This action cannot be undone". If the impact cannot be read it shows an alert with "Retry" and the confirm button stays disabled: nobody confirms blind. It asks once (also under `StrictMode`, with a key that remembers the request) and a single confirmation is enough
- **A dialog makes its own requests and reports the outcome**: the modal takes `course`, `onDeleted`, `onGone`, `onCancel` and `onExited`, calls the service and keeps the double-click guard (`ref`), "Deleting…" and the disabled buttons; Escape and a click outside do not close it while the request is in flight. A failure stays inside the dialog (alert, retry); a `404` means the record is gone, so the dialog closes and the page reloads the list and says so. The page only decides what to do with the result
- **Remove the row from state, then move the focus to the title**: after a `200` the page filters the record out of the loaded list (no new request) and shows a `role="status"` notice (page state, which takes priority over the one the navigation brings). The button that opened the dialog no longer exists, so the focus goes to the `h1` (`tabIndex={-1}`) one turn after `onExited` (`setTimeout(…, 0)`): react-bootstrap releases its focus trap just after `onExited` and focusing at that very moment lets its pending "enforce focus" check give the focus back to the closing dialog. jsdom does not show it, so it needs an E2E (`have.focus`). On cancel the library restores the focus to the button
- **A dialog can read the record instead of an impact endpoint**: `DeleteProfessorModal` fetches `GET /api/professors/{id}` once on open (also under `StrictMode`), keeps "Delete" disabled until it arrives and warns of the class that will be left without a tutor; the same sync guard, no close while deleting and `onGone` on a `404` as in `DeleteCourseModal`. The notice after the delete uses what the `DELETE` returned (`freedClass`), which may differ from what the dialog showed

### Lists: Table or Cards, and Search in the Browser

- **A list of records that has no actions is a table on wide screens and cards on narrow ones, and only one is rendered**: `useMediaQuery('(min-width: 768px)')` (Bootstrap's `md`) chooses, reading `matchMedia` in the first render so the wrong structure is never painted first. Drawing both and hiding one with CSS doubles the nodes in the DOM and in the tests; a table that CSS stacks into cards keeps table semantics where screen readers announce stacked cells badly
- **The table is a real table**: `aria-labelledby` pointing at the page's `h1`, `th scope="col"` for the columns and the record's name in a `th scope="row"`. Cards are a `ul` named by the `h1` with one `li` per record, the name as an `h2` and the data in a `dl`. Both use the same prepared rows, so they cannot show different data
- **Show only what exists**: no empty columns and no disabled buttons or links for features that a later story will add (edit, delete, students, schedule); each story adds its own column or action
- **Dates and counts use the active language**: `Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })` and i18next plurals (`classCount_one` / `classCount_other` with `count`)
- **Filter in the browser when the whole list is already loaded and small**: a pure function in `utils/` (`matchesCourseSearch`) normalizes both sides (lowercase, accents removed with NFD and `\p{M}`, trimmed, whitespace collapsed; `º` and `ª` are kept) and uses `includes`, never a regular expression built from the input. The page keeps the text in its own state: not in the URL, not in storage, and no new request
- **Announce the result and offer a way out**: an `input type="search"` with a visible label, a `role="status"` line ("Showing 2 of 4 courses") only while there is text, and, with no matches, the message with the searched text plus a "Clear search" button that empties the field and returns the focus to it. The search box only exists when there is something to search
- **Match every word of the query, in any order, when people are searched**: `matchesPersonSearch({ firstName, lastName }, query)` (`utils/personSearch.ts`, shared by professors and students) reuses `normalizeForSearch`, splits the normalized query on spaces and requires each word (`includes`, never a regular expression) in the normalized "first last" text, so "garcia ana" and "gar an" find "García, Ana". An empty or blank query matches everyone. Hyphens and apostrophes are normal text. It takes only the searchable fields, so adding one later (subjects) means extending that text
- **Filter before paginating and go back to the first page when the query changes**: the filter runs inside the memo that prepares the rows and the pagination works on the filtered rows. Reset the page in the same handler that sets the query (`setQuery` and `setPage(1)` together), not in an effect that watches it, so there is no render with the old page. "Clear search" does the same and focuses the field
- **One count line with two roles**: without a query it is the plain total ("45 professors", no role); with a query the same element becomes a `role="status"` with "Showing N of M" or the no-match message (the typed text as plain text, never as markup). It stays the target of `scrollIntoView`, and there is a single announcement instead of two
- **Paginate in the browser when the whole list is already loaded and small**: a pure function (`utils/pagination.ts`: `pageCountOf` with a minimum of one page and `paginate`, which clamps an out-of-range page to the first or the last so a reloaded shorter list never shows an empty page) slices the already prepared rows. The page size is a constant of the page (20) and the API gets no parameters. The table and the cards show the same slice
- **The page lives in the page state, not in the URL or in storage**: opening the list starts on the first page. Clamp it when rendering (`Math.min(page, pageCount)`) instead of correcting the state
- **The pagination is a reusable `nav` with a name**: `components/Pagination.tsx` (`page`, `pageCount`, `onPageChange`, `label`) draws "Previous", "Page X of N" and "Next", draws nothing with one page, disables "Previous" on the first page and "Next" on the last, and puts the indicator in an `aria-live="polite"` region so the change is announced without moving the focus. Each list passes its own accessible name ("Professors pagination")
- **Keep the focus on the button that was pressed**: a disabled button loses the focus, so when a change disables the pressed button (the first or the last page is reached) move the focus to the other one **after the render** (an effect that reads a ref set by the click: the other button is still disabled when the click runs). Test it with `toHaveFocus` in a component test and with `have.focus` in the E2E
- **Scroll to the top of the list when the page changes, but do not move the focus there**: `scrollIntoView({ block: 'start' })` on the element above the list; the focus stays on the pagination so "Next" can be pressed repeatedly. jsdom has no `scrollIntoView`: the test defines it as a mock and removes it afterwards
- **Show the total above the list** with an i18next plural (`professors.count_one` / `_other`) when there are records, never in the empty state. Long names use `text-break` so they wrap instead of overflowing at 360 px
- **Test both layouts with a simulated `matchMedia`**: `testSupport/matchMedia.ts` (`installMatchMedia(width)`) lets a test set the width and fire `change`; jsdom does not implement it. Run the same behaviours at both widths with `describe.each`

### Forms with a Dynamic List of Rows

- **Rows have a stable identity, not their position**: each row carries a `key` from a counter in a `ref`, used for React's `key` and for the id of its field, so removing a row does not move the typed value or the error of another one. The visible label is the position ("Class 2") and renumbers
- **Name every row control with its row**: the remove button shows a short text ("Remove") and has an `aria-label` that identifies the row ("Remove class 2") that contains the visible text. The last row has no remove button and the add button is disabled at the maximum. Group the rows in a `fieldset` with a `legend`
- **Errors go with their field**: validate with the rules shared with the backend (`validateCourse`), show each error in a `Form.Control.Feedback` whose `id` is in the control's `aria-describedby`, set `aria-invalid`, move the focus to the first invalid control and clear a field's error as soon as it is edited. Field errors are not `role="alert"` (there would be many); the one general error of the form is
- **Map the server's field errors to rows**: `classes[<i>].name` goes to row `i` (`courseErrorsFromServer`); an unknown field or a row that no longer exists is ignored
- **A conflict is shown on the field that caused it**: a `409 COURSE_ALREADY_EXISTS` marks the name, keeps what was typed and is cleared when the name changes
- **Go back with `replace` and carry a notice in the navigation state**: after creating, `navigate('/cursos', { replace: true, state: { courseCreated: name } })` (after editing, `courseUpdated`); the list reads it with a type guard that accepts only a non-empty text and shows it in a `role="status"`. The state lives in the browser's `history.state`, which survives a reload, so the notice can show again until the person navigates away
- **Create and edit share one form component**: `CourseForm` holds the rows, the validation, the focus and the double-submit guard; the page decides what to call (`create` or `update`) and what to do with each outcome, and passes back a `CourseSubmitResult` (`done`, `validationError`, `nameTaken` or `failed`). The initial values are read once on mount; a page that must start over (a reload after a conflict) gives the form a new `key`
- **Rows of an existing record carry the `id` of the child**: the row keeps it however the person renames it or removes other rows, and the form returns it in the values it submits (`{ id?, name }`); the rows added by the person have none. The server uses it to rename instead of recreate
- **Save only when something changed**: with `requireChanges`, "Save" is disabled while `hasCourseChanges(initial, current)` is false. It compares the cleaned names (an extra space is not a change), the order, the number of rows and the `id`s, and typing something and undoing it leaves it disabled
- **Load by id from the address with a state per outcome**: `EditCoursePage` asks for the course once (also under `StrictMode`), shows `loading`, a `404` message with a link back ("not available", it does not say why), an error with "Retry", or the form. The id of the address is encoded in the URL of the service
- **A conflict that needs fresh data asks for a reload**: `409 COURSE_CHANGED` shows a `role="alert"` with "Reload", keeps what was typed until it is pressed and then asks again and remounts the form, so what was typed is lost and the notice says so
- **A link that looks like a button is a `Link` with the `btn` classes**: react-bootstrap's `Button as={Link}` does not type-check and, in this version, did not render the link in the tests
- **Navigation is for every role that can use the page**: the "Courses" link is shown to `ADMIN` and `MEMBER` and "Users" only to `ADMIN`; the pages of a module do not use `RequireRole`

### Forms with a Select Whose Options Come from Another Resource

- **Load the options once and keep the form usable without them**: `CreateProfessorPage` asks for the courses once (also under `StrictMode`, with a `ref`) to offer the classes. While they load, and if loading fails, the select is disabled with a visible explanation (`aria-describedby`) and the rest of the form can still be submitted without that optional value. A failure of the secondary resource must not block the main action
- **Offer only the options that are valid now**: filter out what the server would reject (classes that already have a tutor) and group the rest with `optgroup` per parent (course), dropping the groups that end up empty. Keep the empty first option ("No class") as the default and send nothing for it
- **Say why there is nothing to choose**: separate messages for "no courses" and "no free classes" instead of an empty list, and keep the select disabled
- **The data can change before the form is sent**: the options are a snapshot, so the server may still answer `409`. Show that conflict on the select that caused it (`aria-invalid`, text in the `aria-describedby`), move the focus to it and keep what was typed. The tests cover it with a component test and with a real E2E where another request takes the option in between
- **Show derived read-only data as text tied to the field**: while the options of a select are not available, the course edit form shows each existing class with "Tutor: name" or "No tutor" as `Form.Text` referenced by the input's `aria-describedby`. The data comes in a separate prop (`classTutors`, by `id`) and not inside the editable draft, so it is not counted as a change and is not sent
- **One select per row, fed by the page, with a read-only mode**: when `tutorOptions` arrives, `CourseForm` gives every row (also the new ones) a `Form.Select` with "No tutor" and the professors, named "Tutor of class N" and with a visible label; the draft then carries `tutorId` (`null` for none). Without `tutorOptions` nothing is sent, so the server leaves the tutors as they are. The page asks for the professors once (also under `StrictMode`), keeps typing and choices when they arrive after mounting, and if they fail shows a warning with "Retry" while the text mode keeps the form usable
- **Offer what is valid for this record**: the professors without a class plus those that tutor a class of this course (labelled with it, "Ana García · class A"), never those of another course. Validate with the shared rule that one professor cannot be on two rows (`DUPLICATE` from the second) and compare the tutor in "has changes" only when both sides have one
- **A conflict reloads the options and marks the row**: on `409 PROFESSOR_ALREADY_TUTOR` the page asks for the professors again and answers the form with `{ status: 'tutorTaken', tutorOptions }`; the form shows a general warning, marks (`aria-invalid`, text in `aria-describedby`) the rows whose professor is no longer among the options, focuses the first and keeps everything typed. The mark clears when that row's select changes. Cover it with a component test and an E2E where the API takes the professor in between
- **A list that grows from another module reads its data with a type guard**: `coursesService` accepts `tutor` only as `null` or `{ id, firstName, lastName }`; anything else is `unavailable`, like the rest of the contract

### A Form Shared by Creation and Edition, with an Option That Displaces Another Record

- **Extract the form when the edition arrives, in its own task**: `ProfessorForm` takes `initialValues`, `courses` (the loading state of the options), `classMode`, `requireChanges`, `failureMessage` and `onSubmit`, and returns to the page a result (`done`, `validationError`, `classTaken`, `failed`). The page decides what to call and where to go. The extraction changes no behaviour: the tests of the creation page must pass unchanged before the edition is built on it
- **Modes instead of two forms**: `free` (creation) offers only the classes without a tutor; `any` (edition) offers all of them, groups them by course and writes "A · tutor: Luis Pérez" on those that have another tutor, except the professor's own. The initial values are read once on mount (`useState` of the prop)
- **Say who will lose it, before and after**: choosing a class with another tutor shows, under the field and linked by `aria-describedby`, "When you save, Luis Pérez will stop being the tutor of 2º Primaria A"; after saving, the list notice names that professor (`replacedTutor` travels in the navigation state next to the name). Compute the notice with a plain function in the render: React Compiler rejects a `useMemo` that returns from inside a loop
- **If the options cannot be loaded, do not send the relation**: the field is disabled with an explanation, the rest of the form works and the page leaves `classId` out of the body, so the server keeps the current tutorship. Do the same for any optional relation that depends on a secondary resource
- **A `404` on save is the same view as a `404` on load**: the record disappeared while it was being edited; show "does not exist or is no longer available" with a link back to the list, not a form error
- **Test the double click with a pending answer**: with an immediate answer the second click arrives after the first response; also remember that the button text changes while pending ("Saving…"), so look it up by that name

### A Form with Dependent Fields and a Required Answer That Starts Empty

- **Derive what is offered from the data at render, not with an effect**: `StudentForm` computes the chosen course and class from `courses` and the values on every render (`chosenCourse`, `classId`); if the course list is reloaded without them they are treated as empty, without touching the other fields or the errors that are shown. It avoids a `setState` in an effect and an extra render with a stale value
- **A dependent select resets and disables itself**: the class is disabled (with a hint tied by `aria-describedby`) until a course is chosen, offers only the classes of that course after "No class", and goes back to "No class" when the course changes
- **A yes/no answer that must be given starts unanswered**: two radios in a `fieldset` with a `legend`, none checked, and the form state is `'' | 'yes' | 'no'` (not a boolean, which cannot say "not answered"); the page converts it to a boolean for the service. The first radio carries the field id so the error can focus it
- **Fields that depend on an answer exist only with it and are discarded when it changes**: the scholarship and the food type appear with "Yes" and are cleared, not just hidden, when the answer becomes "No"; the service does not send them either
- **Validate a field when it loses the focus and all of them on submit**: `onBlur` validates only that field, the error disappears when the field is edited, and submit focuses the first invalid one in form order
- **Tell the person where sensitive text goes**: a help text, tied to the fields by `aria-describedby`, asks to write only what is needed and says it does not appear in the list; the list never shows those fields
- **A reference that disappeared is cleared and marked, not the whole form**: on `NOT_FOUND` for the course or the class the page asks for the courses again while keeping the current ones, and the form shows the error on that select with the focus and keeps everything else that was typed

### Confirming a Local Action Before Saving, With a Number Loaded With the Record

- **Confirm only what is lost, not every click**: removing a row that already exists and has related records (a class with students) opens a dialog; a new row, or one with nothing attached, is removed at once. The dialog only informs and returns the decision: it makes no requests and does not touch the form state
- **Identify the pending row by its stable `key`, not by its position**: positions change when other rows are removed, so the dialog and the confirmation look the row up by `key` at the moment they need it, and the name shown is what is typed now (its position if empty)
- **A number the form only shows is a separate prop, not part of the draft**: `classStudentCounts` (by id, like `classTutors`) is neither a change nor sent. It is the one loaded with the record; if it has changed meanwhile, the data is not lost, so the contract does not recompute it on save
- **Focus**: cancelling returns the focus to the button that opened the dialog (react-bootstrap does it); after confirming that button no longer exists, so the focus goes to a stable control (`Add class`) one turn after `onExited`. jsdom does not reproduce the focus trap, so a Cypress `have.focus` checks it

### Filters and Page in the URL, Derived at Render

- **Derive the filters from the URL at render, do not copy them into state**: `useSearchParams` is the single source of truth. A pure function (`filtersFromParams`) turns the parameters into effective filters and the page into a number, so there is no `setState` in an effect and no second copy to keep in sync
- **Validate every parameter against the data that is loaded**: a course that no loaded student has (deleted, from another school, invented), a class of another course, a value that is not one of the closed ones or `page=abc` are treated as absent, without an error and without rewriting the address; a page beyond the last one is shown as the last. The parameters are only compared with the loaded data, never sent to the API
- **Write the URL with `replace`, without the default values**: `setSearchParams(params, { replace: true, state })` so that "Back" does not walk through every filter, the default values and the dependent filter that does not apply (a class without a course, a scholarship without cafeteria) are not written, and the navigation state that carries a notice is kept. A filter change goes back to the first page. Do not touch the address while the list is still loading: a shared link would be cleaned before it can be validated
- **Keep personal data out of the URL**: the text typed in a search box is a name, so it stays in `useState` (the address ends up in the browser history, in bookmarks and in copied links). Only identifiers and closed values go to the URL
- **Dependent selects are disabled and explained, not hidden**: the class (without a concrete course) and the scholarship (without cafeteria "yes") stay in place, disabled, with a help text tied by `aria-describedby`; changing the controlling filter resets the dependent one
- **Test the address with a probe that does not use `<output>`**: a small component that prints `location.pathname + search` and the navigation type (`REPLACE`) in `span`s; an `<output>` has the implicit role `status` and breaks the tests that wait for a single status

### Going Back to a List Keeping Its Filters

- **Pass the list's search in the navigation state of the link, not in the address of the edit page**: the "Edit" link of each row is `<Link to="/alumnos/<id>/editar" state={{ listSearch: location.search }}>`. The edit address stays clean (`/alumnos/<id>/editar`) and nothing about the filters is written in two places. The text typed in the search box is not part of `location.search` (see "Filters and Page in the URL, Derived at Render"), so it never travels
- **Read it with a guard and build the way back from a fixed path**: `returnSearchFrom(state)` accepts only a text that is empty or starts with `?` and has no `#` or line breaks, and gives `''` for anything else (no state, another shape, a manipulated value). The way back is always `{ pathname: '/alumnos', search }`, never a string taken from the state, so it cannot lead to another site. "Cancel", "Save" and the rest of the exits use the same destination
- **The browser keeps the state through a reload, a direct link does not have it**: with `BrowserRouter` the state lives in `history.state`, so reloading the edit page still goes back with the filters, while a link opened from elsewhere goes back to the unfiltered list, without an error. In Cypress, visiting the address you are already at is a reload (it keeps the state): to simulate a direct link visit another page first
- **Replace the entry when saving and pass the notice in the state**: `navigate(returnTo, { replace: true, state: { studentUpdated: name } })`, so "Back" does not return to the form. The list reads it with the same guard as the creation notice, shows it as plain text in a `role="status"` and keeps it while the filters change. A student that no longer matches the filters is just not listed, without an error
- **"Save" is enabled by what would be sent, not by what was typed**: `hasStudentChanges(initial, current)` compares the request body (`toStudentBody`, shared with the creation and the update) built from cleaned values, so extra spaces, undoing a change or the scholarship of someone who does not eat at school do not count, and the rule cannot drift from the real request
- **A field that is required only to save is explained, not pre-filled**: a student whose course was deleted opens with the course empty and a note under the field tied by `aria-describedby` (`courseMissingNotice`); "Save" is enabled by any other change and the form asks for the course on submit, with the focus on it. Do not choose a course for the user
### Deleting a Row From a List That Lives in the Address

- **A confirmation dialog with nothing to warn about asks nothing**: `DeleteStudentModal` gets `{ id, name }` from the row, shows the title, "This action cannot be undone" and the two buttons, and sends one `DELETE`. A student has no dependants, so there is no impact to read, and the sensitive data (`foodType`, `observations`) never travels to the browser to delete. A record that has dependants (a course, a professor) keeps the dialog that asks before confirming.
- **Keep two lists: the catalog as it was loaded and the current one**: after a local delete the rows, the total and the page come from the current list, but `filtersFromParams`, `courseOptions` and `classOptions` use the catalog. A filter on a course whose last student was just deleted stays applied (empty result with "Clear filters") and its option stays in the select, instead of silently jumping to everybody; a reload or a retry makes both lists the response again.
- **Do not touch the address after deleting**: the filters, the page and the search text stay as they were, the page notice (`pageNotice`) replaces the arrival notice (`created`, `updated`) and the focus goes to the title one turn after `onExited`, as in the other deletes.
- **Never register the same `cy.intercept` alias twice**: a nested `describe` that repeats the `cy.intercept(...).as('listStudents')` of the outer `beforeEach` makes `@listStudents.all` count every real request twice, which looks like a duplicated request in the app when there is none (a probe showed one real `GET` per load of `/alumnos`, `/cursos` and `/profesores`). Register the alias once, at the outermost level that needs it, and assert the exact count (`have.length`, 1).
- **A calendar form generates rows and then lets people edit each one**: `CalendarForm` fills the table of periods from a small generator (start, number of sessions, duration, optional break) and every row stays an editable `input type="time"` with its own accessible name ("Inicio de la sesión 2", "Fin del recreo 1"); the generator replaces the rows and says so. The initial rows are a module constant, not a ref read while rendering.
- **Show what a choice will move before saving**: the courses checklist writes "Ahora sigue «X»: se moverá" under a course that already follows another calendar (read once from the list of calendars; without it the form still works, only that notice is missing).
- **The role guard of a screen is a convenience**: `/calendarios/nuevo` hangs from `RequireRole role="ADMIN"` and the list hides "Crear calendario" for a `MEMBER`, who sees a read-only message; the backend decides.
- **Check the header at 360 px whenever a link is added**: the navigation wraps (`flex-wrap`) because the five links of an administrator no longer fit in one line; the E2E that measures `scrollWidth` found it, and the measuring spec should list the offending elements instead of guessing.
- **One form for creating and editing, with the edit mode behind optional props**: `CalendarForm` takes `initialValues` (read only on mount: rows, name and the courses that already followed the calendar) and `requireChanges`; without them it is the creation form. `hasCalendarChanges(initial, current)` compares what would be sent (cleaned name, periods sorted by time, the set of courses), so a trailing space, another order of the courses or an undone change is not a change.
- **While a list that feeds a checklist is not loaded, send the saved choice untouched**: in the edit mode, if the courses are loading or failed, `CalendarForm` sends the initial `courseIds` instead of an empty list, because saving would otherwise free every course without anyone asking for it; "Save" stays disabled until something else changes.
- **Tell what an unchecked item will lose, next to the item**: an own course that is unchecked shows "Se quedará sin calendario" and one that follows another calendar shows "Ahora sigue «X»: se moverá", both tied with `aria-describedby`; the edit page removes its own calendar from the `followedBy` map so it never warns about itself.
- **Show the edit link only to the role that can edit**: `CalendarsPage` paints "Editar {name}" (visible text contained in the `aria-label`) only for `ADMIN`; the route hangs from `RequireRole` and the backend decides.
- **When the order of the rows decides the meaning, sort before validating and keep the table sorted**: the backend reads the periods by position (which one is "session 3", whether a break sits between two sessions), but people edit hours, so `CalendarForm` runs `sortPeriods` on submit (stable, and only when every time is well written, because an empty time cannot be sorted), validates the sorted rows, and leaves the table sorted so the labels, the errors and the focus match what is seen. Sorting on every keystroke was discarded because the rows jump while typing.
- **A dialog can list the dependants the card already has and let the server correct the count afterwards**: `DeleteCalendarModal` gets `{ id, name, courses }` from the card, asks nothing on open and says which courses will be left without a calendar ("Ningún curso sigue este calendario" if there are none). The notice after the delete uses the `courseCount` the `DELETE` answered (what was really freed, with its plural), which may differ from the card if another person assigned a course meanwhile. A `403` is shown like any other failure inside the dialog: hiding "Borrar" from a `MEMBER` is a convenience, the backend decides.
- **A confirmation dialog reminds of a cheaper alternative with plain text, not with a button**: `DeleteSubjectModal` says "If it has only stopped being taught, you can deactivate it from Edit" as a paragraph, because the dialog makes no `PUT` and a second action beside "Delete" invites the wrong click; a test requires exactly the two buttons ("Cancel" and "Delete") and no link inside the dialog. The same dialog lists the courses of the card ("Taught in: …" or "Not taught in any course") and asks nothing on open.
- **A closed palette is a list of keys with the looks in the frontend, and a test measures the contrast**: `SUBJECT_COLOR_STYLES` (`utils/subjectColors.ts`) gives each of the 12 keys a background, a text color and a border; a test requires at least 4.5:1 between text and background, 3:1 for the border over white, and different backgrounds. The server stores only the key. `contrastRatio` implements the WCAG 2.1 formula, so the check does not depend on the browser (jsdom cannot measure contrast, which is why `axe` runs with `color-contrast` disabled).
- **Colour is never the only clue**: in a list, `SubjectColorSwatch` is `role="img"` named "Color: Azul"; in the form, where the name is written next to the swatch (a radio with its label), it is `decorative` and `aria-hidden`. The default colour is the first one of the palette that no subject of the school uses, computed by the page before mounting the form, because the form reads its initial values only on mount; if the subjects cannot be read it uses the first colour and still works.
- **Keep one list of options and fix it against the contract with a type test**: `utils/subjectOptions.ts` exports `SUBJECT_TYPES`, `SUBJECT_STATUSES` and `SUBJECT_COLORS` `as const satisfies readonly Schemas['…'][]`, and a `expectTypeOf` test requires the union of each to equal the generated enum, so a value added to the contract fails the typecheck. The service, the validation and the palette import it instead of copying the lists.
- **Derive what is sent from the loaded list, keep the choices by id**: `SubjectForm` stores the ticked courses as `{ [courseId]: sessions }` and builds the courses to send, in the order of the list, from the courses that are loaded now; a ticked course that disappears when the list is reloaded is not sent. Server errors arrive by position in what was sent (`courses[1].courseId`), so the form keeps the ids it sent and shows each error under its own course.
- **A bounded integer is a `select`, and the validation still covers the range**: the weekly sessions (1 to 5, 2 on ticking) are a `Form.Select` that cannot hold an out-of-range value, but `validateSubjectSessions` and the shared table `test-fixtures/subject-fields.json` still reject 0, 6 and 2.5, because the server may answer `OUT_OF_RANGE` to a hand-made request.
- **Filter and search a loaded list in the browser, without asking again**: `matchesSubjectFilters` combines type, status and the text of `matchesCourseSearch` (name or code, without capitals or accents); the filters live in component state (not the address: there is no detail page to come back from) and the E2E asserts `@listSubjects.all` has length 1. The summary of the courses is a button with `aria-expanded` and `aria-controls` that shows the list only when open.
- **Mount an edit form only when everything it reads on mount has answered once, and never unmount it afterwards**: `EditSubjectPage` shows the loading status until both the subject and the courses have answered (success or failure; a failure of the courses still mounts the form, with its own retry), because `SubjectForm` reads `initialValues` only on mount. Later reloads of the courses (a course deleted by someone else while editing) set the list to loading again but do not unmount the form, so what was typed stays; a boolean `coursesAnswered` that only goes up tells the two moments apart. A new load of the subject remounts the form with the server values (`key={attempt}`).
- **Give a child back the value it had when it is ticked again, so that undoing leaves Save disabled**: the form keeps the sessions the subject had in each course when it opened (`original`, from `initialValues`, empty in the creation) and ticks a course again with that value, or with the default 2 if it is a new one. Without it, unticking and ticking a course changes its sessions silently to 2 and the person cannot get back to "no changes". The same comparison, `hasSubjectChanges(loaded, wouldSend)`, runs at render on what would be sent (the ticked courses that are still in the list), so a course that disappeared from the list counts as a change and is not sent.
- **Say it when an edited record starts with an empty collection that must be filled**: a subject whose courses were all deleted opens with "Esta asignatura no tiene cursos: marca al menos uno para guardarla" under the courses, tied to the fieldset with `aria-describedby` and shown only while nothing is ticked; Save stays enabled after any other change and the validation still answers "Marca al menos un curso" with the focus on the first checkbox. The notice informs and the validation decides.

### Secrets Shown Once

- **Keep a one-time secret only in component state**: the generated link (invitation or password reset) lives in the state of `GeneratedLinkPanel`, never in `localStorage`, `sessionStorage`, the URL or a service cache. "Done" drops it; after a reload only the record (without the secret) comes back from the server. A test checks that the text is gone from the document after closing the panel
- **Share the panel through props, not copies**: `GeneratedLinkPanel` receives the title, the field label, the warning and an id prefix (`invitation`, `password-reset`) already translated by the caller; the copy and "Done" buttons are common. The prefix keeps the field ids that the E2E selects (`#invitation-link`). A page that shows one link at a time keeps it in a single state value and drops it when that user's link is revoked
- **Tell the user it will not be shown again** (`invitations.link.warning`, `users.passwordReset.link.warning`) and put the secret in a read-only text field with a visible label, so it can be selected
- **Copy with a fallback, not an assumption**: `navigator.clipboard.writeText` may be missing (insecure context) or reject (permission). On failure select the field's text and show how to copy it by hand. The result is announced in a `role="status"` element rendered only when there is something to say (a live region that is empty when `findByRole` resolves breaks the assertion), and the panel itself is a `role="group"`, not an `Alert`, which would add a second `role="alert"` next to the error notices
- **A section that fails on its own does not break its page**: `InvitationsSection` handles its own list, loading and error states and receives `onForbidden` from the page, so a failing list of invitations leaves the table of users working. In page tests simulate the section's service, and scope the other assertions (`getByText(...).closest('[role="status"]')`) because there are now two loading indicators
- **E2E selectors name their table**: with two tables on a page use `table[aria-labelledby="<title-id>"]`, not `table`
### Secrets Received in the URL Fragment

- **Read the secret once and take it out of the address bar**: the public pages (`AcceptInvitationPage`, `PasswordResetPage`) read `window.location.hash` in an effect guarded by a `ref` (so `StrictMode` running the effect twice cannot lose it) and immediately calls `history.replaceState(history.state, '', pathname + search)`. Keep the router's own `history.state`; replacing it with `null` breaks `BrowserRouter`. The token then lives in a `ref`, never in state that is persisted, `localStorage`, `sessionStorage` or the URL; a retry reuses the `ref`
- **Send it in the body, never in the path or the query**: so it does not reach access logs. A public service uses plain `fetch` (no `authorizedFetch`) and returns an outcome per case (`found`, `accepted`, `invalid`, `emailAlreadyRegistered`, `validationError`, `tooManyAttempts` with minutes, `unavailable`), interpreting the answer by `error.code`; it never throws
- **A missing token is the same view as an invalid one**: show it without calling the server. Do not distinguish expired, used, revoked or unknown links in the interface either
- **Pass a one-off notice to the next page through the navigation state**: after creating the account, `navigate('/login', { replace: true, state: { accountCreated: true, email } })`, and after a password reset `{ passwordChanged: true }` (no email: the link only knows the masked one). The destination reads `useLocation().state` with a single type guard (`arrivalFrom`) that accepts only those exact shapes and ignores anything else (and an email that is not a string), shows the notice in a `role="status"` (an `Alert` has `role="alert"` by default) and hides it at the first submit. Nothing is stored, so reloading the page drops it. In tests, wait for the notice by its text: while the session loads another `role="status"` exists
- **A "repeat the password" field is a client-side check only**: `PasswordResetPage` compares the two fields before sending, shows `passwordReset.mismatch` under the second one and never sends the repetition; the server only knows the password
- **Reuse the registration's validation and texts** for the same fields (`validateField`, `registration.fields.*`, `registration.errors.*`, the privacy policy label), with the page's own element ids. A server error for the privacy checkbox must be shown too, not only the text fields

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

### Authentication Pages

- **One captcha flow for every protected form**: `LoginPage` and `RegisterPage` share `components/CaptchaChallengeWidget` (the v2 challenge: drawn on mount, removed on unmount, with `onToken`, `onUnavailable` and an imperative `reset`), `components/RecaptchaNotice` (the notice that Google requires) and the `captcha.*` texts of i18n. A new page with reCAPTCHA reuses them; the instruction above the challenge is a prop, so each page keeps its own wording
- **A fresh v3 token per submit**: `captcha.executeV3(<ACTION>)` with the same action the backend expects (`REGISTER_ACTION`, `LOGIN_ACTION`). With the challenge visible the page sends the v2 token and does not ask for a v3 one. A script that does not load is "unavailable": the page shows the message and does not call the backend
- **Services decide by status and `error.code`, and never throw**: `services/loginService.ts` returns a `LoginOutcome`, and everything it does not know (`503`, `500`, a `400` that the form already prevents, a body that is not JSON, no connection) is `unavailable`. The helpers every service needs (`readJson`, `errorCodeOf`, `parseRetryAfter`) are in `services/httpResponse.ts`; the minutes shown for a `429` come from `utils/retryAfterMinutes.ts`
- **What to keep after a failure**: keep the email and empty the password, clearing its "touched" state so it is not flagged as empty. The v2 challenge is not an error, so keep everything. The invalid-credentials message is the same for every cause and never says which field is wrong; never show `error.message`
- **Double submits** are stopped with a synchronous guard (`isSubmittingRef`), not with `isPending`, which only changes on the next render
- **Redirects**: a page that needs a session hangs from `AuthenticatedLayout` (see "Protected Pages"), which sends an anonymous user to `/login`, and `/login` sends an authenticated user to `/onboarding`. While the session is `loading` show a `role="status"` indicator and do not redirect, so a signed-in user does not see the form flash. After a successful login navigate with `replace: true`, so Back does not return to the form
- **Tests**: split them by concern, as `LoginPage.test.tsx` (form, validation, token), `LoginPage.server.test.tsx` (each answer), `LoginPage.redirect.test.tsx` and `LoginPage.a11y.test.tsx`. axe reports a missing `aria-describedby` target only as "incomplete", so assert the link between a field and its error in a component test. For E2E states the application cannot produce yet (a suspended account) use a Cypress task that changes the test database (`cy.task('setUserStatus', ...)`, or `cy.task('createUser', ...)` to add a member to the school of another user; both restricted to databases whose name ends in `_test`)
- **Closing the session is confirmed by the server**: `useSession().logout()` calls `sessionService.logout()` (a `LogoutOutcome`, never throws; only a `204` is `loggedOut`) and changes the state to `anonymous` only then. On failure the session stays open and the caller shows the error. It also invalidates any renewal in flight (the request counter), so a late `/refresh` answer cannot reopen the session. No confirmation dialog: closing by mistake only costs logging in again.
- **Warn the other tabs with `BroadcastChannel`**: `SessionProvider` opens `calendarschool:session` only if the browser has it (`typeof BroadcastChannel !== 'undefined'`), publishes `{ type: 'logout' }` after a confirmed close, and turns the tab `anonymous`, without calling the server, when it receives that message (other shapes are ignored). It closes the channel on unmount. Without it the other tab finds out at its next renewal (`401`).
- **The header belongs to the session, not to a page**: `components/AppHeader` is mounted once by `AuthenticatedLayout` (public pages have no header, even with a session) and renders nothing unless the session is `authenticated`. It navigates to `/login` with `replace: true` after a close; the session provider does not depend on the router. It keeps a synchronous guard (`isClosingRef`) against double clicks and shows its failure with `role="alert"`. It holds the navigation (for now only "Users", for administrators) and is provisional until the content of US04.
- **Test a `BroadcastChannel` with a fake** (`vi.stubGlobal`) that delivers to the other instances with the same name, as the real one does (not to the sender), so the tests do not depend on what jsdom or Node provide.

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

### Content Security Policy
- **One source of truth**: `frontend/content-security-policy.json` (directive → sources). `src/security/contentSecurityPolicy.ts` serializes it and two places use it: `vite.config.ts` (`preview.headers`, so `vite preview` and the E2E serve it) and `infrastructure/lib/appStack.ts` (the CloudFront `ResponseHeadersPolicy`, with `override: true`). Never write the header by hand anywhere else
- **Not in `server.headers`**: the Vite dev server injects an inline script for HMR and React Refresh, which the policy would block
- **Strict from the start**: no `Report-Only`, no `'unsafe-inline'` or `'unsafe-eval'` in `script-src`, and no wildcards (a test enforces it). Styles are `'self'`: React `style={...}` goes through the CSSOM and is not affected, but an inline `<style>` or a `style="..."` attribute in the HTML is blocked
- **A new external origin is a policy change**: add it to the JSON with the narrowest path, update `design.md` and the spec of the change first, and update `contentSecurityPolicy.test.ts`. Do not assume which context makes a request: reCAPTCHA v3 sends `api2/clr` from the page, not from its iframe, and that needed `connect-src https://www.google.com/recaptcha/`
- **Validate in a real browser with real keys** before publishing a change to the policy: build with the site keys in `frontend/.env.production.local` (never versioned, deleted afterwards), `vite preview`, a listener for `securitypolicyviolation` and a clean browser context (a cached HTML keeps the old policy)
- **Cypress**: it strips the policy by default. `experimentalCspAllowList` lists `default-src`, `child-src`, `frame-src`, `script-src`, `script-src-elem` and `form-action` (with `true` it would strip those six); `frame-ancestors` is always removed, so check it with `cy.request`. `csp.cy.ts` checks the header and that an inline script is blocked and reported, which proves the policy is enforced under Cypress

### Environment Configuration
- Call the API through the relative `/api` prefix; in development the **Vite proxy** forwards `/api/*` to the backend, so frontend and API share origin (no CORS, same cookie behavior as production)
- **Keep the session in memory only**: the access token and the user live in React state (`SessionProvider`), never in `localStorage`, `sessionStorage` or a cookie readable by JavaScript. The refresh token travels in an `HttpOnly` cookie that only the server reads; the app gets the access token with `POST /api/auth/refresh` (`credentials: 'same-origin'`) once at startup and after a sign-up
- Use **environment variables** (`import.meta.env.VITE_*`) only for values that really differ per environment. Read them in **one module** (`captcha/captchaConfig.ts` for the reCAPTCHA site keys) and pass the interpreted value on; they are public, so never put a secret in a `VITE_*` variable. The template is `frontend/.env.example`, copied to `frontend/.env.local`
- **Captcha client**: the form talks to a `CaptchaClient` interface with a real implementation (loads the Google script the first time a token or the challenge is needed, only on the registration page, with a 10 second limit and a retry after a failure) and a fake one used without site keys. Ask for a **new v3 token on every submit** (they are single use and expire in 2 minutes), show the v2 challenge when the server asks for it keeping all the data, and treat a script that does not load as "unavailable" without calling the backend. Tests inject a controllable client through `CaptchaClientContext`
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

