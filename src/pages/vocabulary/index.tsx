import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Pencil, ArrowLeft, Save } from 'lucide-react-taro';
import './index.css';

// Fix: 统一 WordItem 接口，与 upload/dictation 页面一致
interface WordItem {
  word: string;
  meanings: string[];
  date: string;
}

const VocabularyPage = () => {
  const [newWords, setNewWords] = useState<WordItem[]>([]);
  const [reviewWords, setReviewWords] = useState<WordItem[]>([]);
  const [activeTab, setActiveTab] = useState<'new' | 'review'>('new');
  const [editingWord, setEditingWord] = useState<WordItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newWordInput, setNewWordInput] = useState('');
  const [newMeaningInput, setNewMeaningInput] = useState('');

  useLoad(() => {
    loadVocabularies();
  });

  // Fix: 统一存储 key 命名
  const loadVocabularies = () => {
    const storedNewWords = Taro.getStorageSync('new_vocabulary') || [];
    const storedReviewWords = Taro.getStorageSync('review_vocabulary') || [];
    setNewWords(storedNewWords);
    setReviewWords(storedReviewWords);
  };

  // Fix: 统一存储 key
  const getCurrentWords = () => activeTab === 'new' ? newWords : reviewWords;
  const setCurrentWords = (words: WordItem[]) => {
    if (activeTab === 'new') {
      setNewWords(words);
      Taro.setStorageSync('new_vocabulary', words);
    } else {
      setReviewWords(words);
      Taro.setStorageSync('review_vocabulary', words);
    }
  };

  // 删除单词
  const handleDelete = (index: number) => {
    Taro.showModal({
      title: '确认删除',
      content: '确定要删除这个单词吗？',
      success: (res) => {
        if (res.confirm) {
          const words = getCurrentWords();
          const updatedWords = words.filter((_, i) => i !== index);
          setCurrentWords(updatedWords);
          Taro.showToast({ title: '已删除', icon: 'success' });
        }
      },
    });
  };

  // 开始编辑
  const handleEdit = (word: WordItem, index: number) => {
    setEditingWord({ ...word, _index: index } as WordItem & { _index: number });
    setIsAdding(false);
  };

  // Fix: 适配新的 WordItem 接口
  const handleSaveEdit = () => {
    if (!editingWord) return;
    
    const words = getCurrentWords();
    const index = (editingWord as WordItem & { _index: number })._index;
    words[index] = {
      word: newWordInput || editingWord.word,
      meanings: newMeaningInput ? newMeaningInput.split('；') : editingWord.meanings,
      date: editingWord.date,
    };
    setCurrentWords(words);
    setEditingWord(null);
    setNewWordInput('');
    setNewMeaningInput('');
    Taro.showToast({ title: '已保存', icon: 'success' });
  };

  // 开始添加
  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingWord(null);
    setNewWordInput('');
    setNewMeaningInput('');
  };

  // Fix: 适配新的 WordItem 接口
  const handleAdd = () => {
    if (!newWordInput.trim()) {
      Taro.showToast({ title: '请输入单词', icon: 'none' });
      return;
    }
    if (!newMeaningInput.trim()) {
      Taro.showToast({ title: '请输入含义', icon: 'none' });
      return;
    }

    const words = getCurrentWords();
    const newWord: WordItem = {
      word: newWordInput.trim(),
      meanings: newMeaningInput.trim().split('；'),
      date: new Date().toLocaleDateString('zh-CN'),
    };
    
    // 检查是否已存在
    const exists = words.some(w => w.word === newWord.word);
    if (exists) {
      Taro.showToast({ title: '单词已存在', icon: 'none' });
      return;
    }

    setCurrentWords([...words, newWord]);
    setIsAdding(false);
    setNewWordInput('');
    setNewMeaningInput('');
    Taro.showToast({ title: '已添加', icon: 'success' });
  };

  // 返回首页
  const handleBack = () => {
    Taro.navigateBack();
  };

  // 开始听写
  const handleStartDictation = () => {
    const words = getCurrentWords();
    if (words.length === 0) {
      Taro.showToast({ title: '词库为空', icon: 'none' });
      return;
    }
    Taro.navigateTo({
      url: `/pages/dictation/index?type=${activeTab}`,
    });
  };

  const currentWords = getCurrentWords();

  return (
    <View className="min-h-screen bg-white p-4">
      {/* 头部 */}
      <View className="flex items-center gap-3 mb-4">
        <View onClick={handleBack}>
          <ArrowLeft size={24} color="#3b82f6" />
        </View>
        <Text className="block text-xl font-semibold text-gray-800">词库管理</Text>
      </View>

      {/* 标签切换 */}
      <View className="flex gap-2 mb-4">
        <View
          className={`px-4 py-2 rounded-full ${activeTab === 'new' ? 'bg-blue-500' : 'bg-gray-100'}`}
          onClick={() => setActiveTab('new')}
        >
          <Text className={activeTab === 'new' ? 'text-white' : 'text-gray-700'}>
            新单词 ({newWords.length})
          </Text>
        </View>
        <View
          className={`px-4 py-2 rounded-full ${activeTab === 'review' ? 'bg-orange-500' : 'bg-gray-100'}`}
          onClick={() => setActiveTab('review')}
        >
          <Text className={activeTab === 'review' ? 'text-white' : 'text-gray-700'}>
            复习 ({reviewWords.length})
          </Text>
        </View>
      </View>

      {/* 词库说明 */}
      <View className="mb-4 p-3 bg-gray-50 rounded-lg">
        <Text className="block text-sm text-gray-600">
          {activeTab === 'new' 
            ? '新单词词库：每次上传照片后覆盖替换，不累加' 
            : '复习词库：答错的单词自动加入，答对后自动移除'}
        </Text>
      </View>

      {/* 单词列表 */}
      <Card className="shadow-md mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            {activeTab === 'new' ? '新单词列表' : '复习词库列表'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {currentWords.length === 0 ? (
            <View className="text-center py-8">
              <Text className="block text-gray-500">暂无单词</Text>
            </View>
          ) : (
            <View className="space-y-2 max-h-96 overflow-auto">
              {currentWords.map((word, index) => (
                <View
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <View className="flex-1">
                    <Text className="block font-medium text-gray-800">{word.word}</Text>
                    <Text className="block text-sm text-gray-600">
                      {word.meanings.join('；')}
                    </Text>
                    <Text className="block text-xs text-gray-400">
                      入库日期: {word.date}
                    </Text>
                  </View>
                  <View className="flex gap-2">
                    <View 
                      className="p-2 bg-gray-200 rounded"
                      onClick={() => {
                        setNewWordInput(word.word);
                        setNewMeaningInput(word.meanings.join('；'));
                        handleEdit(word, index);
                      }}
                    >
                      <Pencil size={16} color="#6b7280" />
                    </View>
                    <View 
                      className="p-2 bg-red-100 rounded"
                      onClick={() => handleDelete(index)}
                    >
                      <Trash2 size={16} color="#ef4444" />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>

      {/* 编辑/添加区域 */}
      {(editingWord || isAdding) && (
        <Card className="shadow-md mb-4 border-2 border-blue-100">
          <CardContent className="p-4">
            <Text className="block text-lg font-semibold mb-3">
              {isAdding ? '添加新单词' : '编辑单词'}
            </Text>
            <View className="space-y-3">
              <View className="bg-gray-50 rounded-xl p-3">
                <Input
                  className="w-full bg-transparent"
                  placeholder="输入英文单词或短语"
                  value={newWordInput}
                  onInput={(e) => setNewWordInput(e.detail.value)}
                />
              </View>
              <View className="bg-gray-50 rounded-xl p-3">
                <Input
                  className="w-full bg-transparent"
                  placeholder="输入中文含义（多个含义用；分隔）"
                  value={newMeaningInput}
                  onInput={(e) => setNewMeaningInput(e.detail.value)}
                />
              </View>
              <View className="flex gap-3">
                <Button
                  onClick={isAdding ? handleAdd : handleSaveEdit}
                  className="flex-1 bg-blue-500 text-white rounded-xl"
                >
                  <View className="flex items-center justify-center gap-2">
                    <Save size={18} color="#ffffff" />
                    <Text className="text-white">保存</Text>
                  </View>
                </Button>
                <Button
                  onClick={() => {
                    setEditingWord(null);
                    setIsAdding(false);
                    setNewWordInput('');
                    setNewMeaningInput('');
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 rounded-xl"
                >
                  <Text>取消</Text>
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>
      )}

      {/* 操作按钮 */}
      <View className="flex gap-3">
        <Button
          onClick={handleStartAdd}
          className="flex-1 bg-green-500 text-white rounded-xl"
        >
          <View className="flex items-center justify-center gap-2">
            <Plus size={18} color="#ffffff" />
            <Text className="text-white">手动添加</Text>
          </View>
        </Button>
        <Button
          onClick={handleStartDictation}
          className="flex-1 bg-blue-500 text-white rounded-xl"
        >
          <Text className="text-white">开始听写</Text>
        </Button>
      </View>
    </View>
  );
};

export default VocabularyPage;