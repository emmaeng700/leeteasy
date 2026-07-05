export const DIFFICULTY_LEVELS = ['All', 'Easy', 'Medium', 'Hard'] as const

export const QUESTION_SOURCES = [
  { label: 'All',        value: 'All' },
  { label: 'Grind 169',  value: 'Grind 169' },
  { label: 'Denny Zhang', value: 'Denny Zhang' },
  { label: 'Premium 98', value: 'Premium 98' },
  { label: 'CodeSignal',  value: 'CodeSignal' },
] as const

// ORDER IS CRITICAL — each question is assigned to exactly ONE pattern (first match).
// Most specific / narrow patterns must come FIRST so they claim their questions before
// the broad catch-all patterns (String, Arrays & Hashing) get a chance.
export const QUICK_PATTERNS = [
  { name: 'Bit Manipulation',     tags: ['Bit Manipulation'] },
  { name: 'Trie',                 tags: ['Trie'] },
  { name: 'Heap',                 tags: ['Heap', 'Heap (Priority Queue)'] },
  { name: 'Stack',                tags: ['Stack', 'Monotonic Stack', 'Monotonic Queue'] },
  { name: 'Sliding Window',       tags: ['Sliding Window'] },
  { name: 'Backtracking',         tags: ['Backtracking'] },
  { name: 'Linked List',          tags: ['Linked List', 'Doubly-Linked List'] },
  // Trees & BST before DFS/BFS so tree problems are captured here, not in DFS/BFS
  { name: 'Trees & BST',          tags: ['Tree', 'Binary Tree', 'Binary Search Tree', 'BST'] },
  // DFS/BFS now only capture the remaining (graph) DFS/BFS problems
  { name: 'DFS',                  tags: ['DFS', 'Depth-First Search'] },
  { name: 'BFS',                  tags: ['BFS', 'Breadth-First Search'] },
  { name: 'Graphs',               tags: ['Graph', 'Union Find', 'Topological Sort'] },
  { name: 'Matrix',               tags: ['Matrix'] },
  { name: 'Two Pointers',         tags: ['Two Pointers'] },
  { name: 'Binary Search',        tags: ['Binary Search'] },
  { name: 'Dynamic Programming',  tags: ['Dynamic Programming', 'Memoization'] },
  { name: 'Greedy',               tags: ['Greedy'] },
  { name: 'Sorting',              tags: ['Sorting', 'Divide and Conquer'] },
  { name: 'Math',                 tags: ['Math', 'Number Theory', 'Simulation'] },
  // String before Arrays & Hashing — String questions rarely share the Array tag
  { name: 'String',               tags: ['String'] },
  // JavaScript-specific questions (closures, async, prototype, concurrency)
  { name: 'JavaScript',           tags: ['JavaScript', 'Concurrency'] },
  // Arrays & Hashing is intentionally LAST — catch-all for any remaining Array/Hash Table questions
  { name: 'Arrays & Hashing',     tags: ['Array', 'Hash Table', 'Prefix Sum'] },
] as const

// Ascending question-count order (fewest → most). Computed from questions_full.json.
// Graphs(5) first, Trees & BST(37) last — consistent ordering throughout the app.
export const DISPLAY_PATTERN_ORDER = [
  // ── High priority ────────────────────────────────────────
  'Arrays & Hashing',    // 18
  'String',              // 8
  'Two Pointers',        // 19
  'Sliding Window',      // 9
  'Sorting',             // 9
  'Binary Search',       // 24
  'Matrix',              // 20
  'Trees & BST',         // 37
  'DFS',                 // 23
  'Graphs',              // 5
  'BFS',                 // 10
  // ── Mid priority ─────────────────────────────────────────
  'Linked List',         // 23
  'Stack',               // 25
  'Heap',                // 20
  'Trie',                // 12
  'Backtracking',        // 10
  'Greedy',              // 6
  // ── Low priority ─────────────────────────────────────────
  'Dynamic Programming', // 24
  'Bit Manipulation',    // 10
  'Math',                // 12
  'JavaScript',          // 7
] as const

export type PatternPriority = 'High' | 'Mid' | 'Low'

export const PATTERN_PRIORITY: Record<string, PatternPriority> = {
  // ── Set 1 (original) ──────────────────────────────────────────────────────
  // High
  'Arrays & Hashing':    'High',
  'String':              'High',
  'Two Pointers':        'High',
  'Sliding Window':      'High',
  'Sorting':             'High',
  'Binary Search':       'High',
  'Matrix':              'High',
  'Trees & BST':         'High',
  'DFS':                 'High',
  'Graphs':              'High',
  'BFS':                 'High',
  // Mid
  'Linked List':         'Mid',
  'Stack':               'Mid',
  'Heap':                'Mid',
  'Trie':                'Mid',
  'Backtracking':        'Mid',
  'Greedy':              'Mid',
  // Low
  'Dynamic Programming': 'Low',
  'Bit Manipulation':    'Low',
  'Math':                'Low',
  'JavaScript':          'Low',

  // ── NeetCode 250 category names ───────────────────────────────────────────
  // High
  'Trees':                        'High',
  'Advanced Graphs':              'High',
  'Intervals':                    'High',
  // Mid
  'Heap / Priority Queue':        'Mid',
  'Tries':                        'Mid',
  // Low
  '1-D Dynamic Programming':      'Low',
  '2-D Dynamic Programming':      'Low',
  'Math & Geometry':              'Low',

  // ── AlgoMaster 600 category names ─────────────────────────────────────────
  // High
  'Arrays':                                   'High',
  'Strings':                                  'High',
  'Hash Tables':                              'High',
  'Prefix Sum':                               'High',
  'Sliding Window - Fixed Size':              'High',
  'Sliding Window - Dynamic Size':            'High',
  'Matrix (2D Array)':                        'High',
  'Tree Traversal - Level Order':             'High',
  'Tree Traversal - Pre Order':               'High',
  'Tree Traversal - In Order':                'High',
  'Tree Traversal - Post-Order':              'High',
  'BST / Ordered Set':                        'High',
  'Depth First Search (DFS)':                 'High',
  'Breadth First Search (BFS)':              'High',
  // Mid
  'Kadane\'s Algorithm':                      'Mid',
  'LinkedList In-place Reversal':             'Mid',
  'Fast and Slow Pointers':                   'Mid',
  'Stacks':                                   'Mid',
  'Monotonic Stack':                          'Mid',
  'Queues':                                   'Mid',
  'Monotonic Queue':                          'Mid',
  'Bucket Sort':                              'Mid',
  'Recursion':                                'Mid',
  'Divide and Conquer':                       'Mid',
  'Merge Sort':                               'Mid',
  'QuickSort / QuickSelect':                  'Mid',
  'Heaps':                                    'Mid',
  'Two Heaps':                                'Mid',
  'Top K Elements':                           'Mid',
  'K-Way Merge':                              'Mid',
  'Data Structure Design':                    'Mid',
  'Topological Sort':                         'Mid',
  'Union Find':                               'Mid',
  'Minimum Spanning Tree':                    'Mid',
  'Shortest Path':                            'Mid',
  // Low
  'Eulerian Circuit':                         'Low',
  '1-D DP':                                   'Low',
  '0/1 Knapsack':                             'Low',
  'Unbounded Knapsack':                       'Low',
  'Longest Increasing Subsequence (LIS)':     'Low',
  '2D Grid DP':                               'Low',
  'String DP':                                'Low',
  'Tree / Graph DP':                          'Low',
  'Bitmask DP':                               'Low',
  'Digit DP':                                 'Low',
  'Probability DP':                           'Low',
  'State Machine DP':                         'Low',
  'Maths / Geometry':                         'Low',
  'String Matching':                          'Low',
  'Binary Indexed Tree / Segment Tree':       'Low',
  'Line Sweep':                               'Low',
}
