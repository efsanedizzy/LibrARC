using System.Collections.Generic;
using UnityEngine;

namespace BlockPlus.Board
{
    public sealed class BoardPlacementResult
    {
        public static BoardPlacementResult Failed { get; } = new BoardPlacementResult(false, 0, new List<Vector2Int>(), new List<Vector2Int>());

        public BoardPlacementResult(bool success, int clearedLineCount, List<Vector2Int> placedCells, List<Vector2Int> clearedCells)
        {
            Success = success;
            ClearedLineCount = clearedLineCount;
            PlacedCells = placedCells;
            ClearedCells = clearedCells;
        }

        public bool Success { get; }
        public int ClearedLineCount { get; }
        public List<Vector2Int> PlacedCells { get; }
        public List<Vector2Int> ClearedCells { get; }
    }
}
