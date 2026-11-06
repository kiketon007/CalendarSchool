import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PreviousSchedulePage } from './PreviousSchedulePage';

const mounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('./ScheduleDraftPage', () => ({
  ScheduleDraftPage: ({ which, scheduleId }: { which?: string; scheduleId?: string }) => {
    useEffect(() => {
      mounts.count += 1;
    }, []);
    return (
      <div data-testid="schedule-page">
        {which}:{scheduleId}
      </div>
    );
  },
}));

describe('PreviousSchedulePage', () => {
  function renderAt(path: string) {
    mounts.count = 0;
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Link to="/horarios/anteriores/second">next</Link>
        <Routes>
          <Route path="/horarios/anteriores/:id" element={<PreviousSchedulePage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('mounts the schedule page in previous mode with the id of the route', () => {
    renderAt('/horarios/anteriores/first');

    expect(screen.getByTestId('schedule-page')).toHaveTextContent('previous:first');
  });

  it('mounts it again, with the new id, when the route changes to another previous schedule', async () => {
    const user = userEvent.setup();
    renderAt('/horarios/anteriores/first');
    expect(mounts.count).toBe(1);

    await user.click(screen.getByRole('link', { name: 'next' }));

    expect(screen.getByTestId('schedule-page')).toHaveTextContent('previous:second');
    expect(mounts.count).toBe(2);
  });
});
