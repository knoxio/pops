import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocationPicker, type LocationTreeNode } from './LocationPicker';

// --- Test data ---

const LOCATIONS: LocationTreeNode[] = [
  {
    id: 'home',
    name: 'Home',
    parentId: null,
    children: [
      {
        id: 'bedroom',
        name: 'Bedroom',
        parentId: 'home',
        children: [{ id: 'wardrobe', name: 'Wardrobe', parentId: 'bedroom', children: [] }],
      },
      { id: 'kitchen', name: 'Kitchen', parentId: 'home', children: [] },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    parentId: null,
    children: [{ id: 'desk', name: 'Desk', parentId: 'office', children: [] }],
  },
];

// --- Tests ---

describe('LocationPicker', () => {
  describe('trigger button', () => {
    it('shows placeholder when no value selected', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} />);
      expect(screen.getByText('Select location…')).toBeInTheDocument();
    });

    it('shows custom placeholder', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} placeholder="Pick a room" />);
      expect(screen.getByText('Pick a room')).toBeInTheDocument();
    });

    it('shows breadcrumb path when value is set', () => {
      render(<LocationPicker locations={LOCATIONS} value="wardrobe" />);
      expect(screen.getByText('Home › Bedroom › Wardrobe')).toBeInTheDocument();
    });

    it('shows single name for root node', () => {
      render(<LocationPicker locations={LOCATIONS} value="office" />);
      expect(screen.getByText('Office')).toBeInTheDocument();
    });

    it('is disabled when disabled prop is true', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} disabled />);
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('tree rendering', () => {
    it('renders root nodes when opened', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} />);
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Office')).toBeInTheDocument();
    });

    it('does not show children by default (collapsed)', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} />);
      fireEvent.click(screen.getByRole('combobox'));
      // Children of Home should not be visible until expanded
      expect(screen.queryByText('Bedroom')).not.toBeInTheDocument();
      expect(screen.queryByText('Kitchen')).not.toBeInTheDocument();
    });

    it('expands children when chevron clicked', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} />);
      fireEvent.click(screen.getByRole('combobox'));
      const chevronSpans = document.querySelectorAll("[role='button'][tabindex='-1']");
      expect(chevronSpans.length).toBeGreaterThan(0);
      fireEvent.click(chevronSpans[0]!);
      expect(screen.getByText('Bedroom')).toBeInTheDocument();
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
    });
  });

  describe('node selection', () => {
    it('calls onChange with node id when clicked', () => {
      const onChange = vi.fn();
      render(<LocationPicker locations={LOCATIONS} value={null} onChange={onChange} />);
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByText('Home'));
      expect(onChange).toHaveBeenCalledWith('home');
    });

    it('calls onChange for nested node after expanding', () => {
      const onChange = vi.fn();
      render(<LocationPicker locations={LOCATIONS} value={null} onChange={onChange} />);
      fireEvent.click(screen.getByRole('combobox'));
      // Expand Home
      const chevrons = document.querySelectorAll("[role='button'][tabindex='-1']");
      fireEvent.click(chevrons[0]!);
      // Click Bedroom
      fireEvent.click(screen.getByText('Bedroom'));
      expect(onChange).toHaveBeenCalledWith('bedroom');
    });
  });

  describe('search filtering', () => {
    it('filters nodes by search text', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} />);
      fireEvent.click(screen.getByRole('combobox'));
      const searchInput = screen.getByPlaceholderText('Search locations…');
      fireEvent.change(searchInput, { target: { value: 'kitchen' } });
      // Kitchen should be visible (and its parent Home)
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
      // Office should be hidden (no match)
      expect(screen.queryByText('Office')).not.toBeInTheDocument();
    });

    it('auto-expands matching ancestors', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} />);
      fireEvent.click(screen.getByRole('combobox'));
      const searchInput = screen.getByPlaceholderText('Search locations…');
      fireEvent.change(searchInput, { target: { value: 'wardrobe' } });
      // Wardrobe is nested under Home > Bedroom — both should be visible
      expect(screen.getByText('Wardrobe')).toBeInTheDocument();
      expect(screen.getByText('Bedroom')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });

  describe('quick-add location', () => {
    it('shows add button when onCreateLocation provided', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} onCreateLocation={vi.fn()} />);
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByText('Add location')).toBeInTheDocument();
    });

    it('does not show add button without onCreateLocation', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} />);
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.queryByText('Add location')).not.toBeInTheDocument();
    });

    it('shows input form when add button clicked', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} onCreateLocation={vi.fn()} />);
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByText('Add location'));
      expect(screen.getByPlaceholderText('Location name…')).toBeInTheDocument();
    });

    it('calls onCreateLocation with name and parent when add clicked', () => {
      const onCreate = vi.fn();
      render(<LocationPicker locations={LOCATIONS} value="bedroom" onCreateLocation={onCreate} />);
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByText('Add location'));
      const nameInput = screen.getByPlaceholderText('Location name…');
      fireEvent.change(nameInput, { target: { value: 'Closet' } });
      fireEvent.click(screen.getByText('Add'));
      expect(onCreate).toHaveBeenCalledWith('Closet', 'bedroom');
    });

    it('disables add button when name is empty', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} onCreateLocation={vi.fn()} />);
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByText('Add location'));
      expect(screen.getByText('Add')).toBeDisabled();
    });
  });

  describe('clear selection', () => {
    it('shows clear button when value is set', () => {
      render(<LocationPicker locations={LOCATIONS} value="home" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByText('Clear selection')).toBeInTheDocument();
    });

    it('does not show clear button when no value', () => {
      render(<LocationPicker locations={LOCATIONS} value={null} />);
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.queryByText('Clear selection')).not.toBeInTheDocument();
    });

    it('calls onChange with null when clear clicked', () => {
      const onChange = vi.fn();
      render(<LocationPicker locations={LOCATIONS} value="home" onChange={onChange} />);
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(screen.getByText('Clear selection'));
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('overlay close without selection', () => {
    it('does not call onChange when Escape key is pressed', () => {
      const onChange = vi.fn();
      render(<LocationPicker locations={LOCATIONS} value={null} onChange={onChange} />);
      fireEvent.click(screen.getByRole('combobox'));
      // Popover should be open — search input visible
      expect(screen.getByPlaceholderText('Search locations…')).toBeInTheDocument();
      // Press Escape to close
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not call onChange when clicking outside the popover', () => {
      const onChange = vi.fn();
      render(
        <div>
          <span data-testid="outside">Outside</span>
          <LocationPicker locations={LOCATIONS} value={null} onChange={onChange} />
        </div>
      );
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByPlaceholderText('Search locations…')).toBeInTheDocument();
      // Click outside element
      fireEvent.pointerDown(screen.getByTestId('outside'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('empty tree', () => {
    it('shows empty message when no locations', () => {
      render(<LocationPicker locations={[]} value={null} />);
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByText('No locations found')).toBeInTheDocument();
    });

    it('still shows add button in empty tree', () => {
      render(<LocationPicker locations={[]} value={null} onCreateLocation={vi.fn()} />);
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByText('Add location')).toBeInTheDocument();
    });
  });
});
