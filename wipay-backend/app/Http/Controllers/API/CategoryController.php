<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(
            Category::where('admin_id', $request->user()->id)
                ->orderBy('name')
                ->get()
        );
    }

    public function show(Request $request, $id)
    {
        return response()->json(
            Category::where('admin_id', $request->user()->id)->findOrFail($id)
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:100',
            'description' => 'nullable|string',
        ]);
        $data['admin_id'] = $request->user()->id;
        $category = Category::create($data);
        return response()->json($category, 201);
    }

    public function update(Request $request, $id)
    {
        $category = Category::where('admin_id', $request->user()->id)->findOrFail($id);
        $data = $request->validate([
            'name'        => 'sometimes|string|max:100',
            'description' => 'nullable|string',
        ]);
        $category->update($data);
        return response()->json($category);
    }

    public function destroy(Request $request, $id)
    {
        $category = Category::where('admin_id', $request->user()->id)->findOrFail($id);
        $category->delete();
        return response()->json(['message' => 'Category deleted.']);
    }
}
