import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ErrorBoundary>
          <Text>All good</Text>
        </ErrorBoundary>,
      );
    });
    expect(tree!.root.findByType(Text).props.children).toBe('All good');
  });

  it('renders a fallback message when a descendant throws', () => {
    const originalConsoleError = console.error;
    console.error = jest.fn(); // React logs the caught error; keep test output clean
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    });
    expect(tree!.root.findAllByType(Text)[0].props.children).toEqual(
      expect.stringContaining('Something went wrong'),
    );
    console.error = originalConsoleError;
  });
});
