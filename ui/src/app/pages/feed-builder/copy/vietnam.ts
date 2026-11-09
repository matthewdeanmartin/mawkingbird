import { PageLanguage } from '../../../focused-tools';
import { TopicCopy } from './topic-copy';
export const COPY: Partial<Record<PageLanguage, TopicCopy>> = {
  vi: {
    title: 'Cộng đồng Việt trên Mastodon: những tài khoản để theo dõi',
    description:
      'Khám phá tài khoản tiếng Việt ở khắp nơi và những người gắn bó với Việt Nam: đời sống, công nghệ, ảnh, học tập và tin tức.',
    heading: 'Cộng đồng Việt trên Mastodon',
    listTitle: 'Cộng đồng Việt',
    intro: [
      'Tìm một góc cộng đồng Việt trên Mastodon: những câu chuyện đời thường, công nghệ, ảnh, học tập và tin tức. Các tài khoản viết tiếng Việt có thể ở Việt Nam, ở nước ngoài hoặc không nêu nơi ở.',
      'Danh sách cũng có tài khoản viết tiếng Anh với mối liên hệ rõ ràng với Việt Nam. Một số tài khoản ít đăng bài; một số là cơ sở giáo dục hoặc dịch vụ thông tin. Hãy xem trước và chọn những gì bạn thích.',
    ],
    faq: [
      {
        q: 'Tôi có cần tài khoản không?',
        a: 'Không cần để đọc hồ sơ và xem trước bài viết công khai. Đăng nhập Mastodon để theo dõi hoặc tạo danh sách.',
      },
      {
        q: 'Mọi người đều sống ở Việt Nam sao?',
        a: 'Không. Tài khoản viết tiếng Việt ở bất cứ đâu đều có thể được chọn. Tài khoản viết tiếng Anh cần có mối liên hệ rõ ràng với Việt Nam.',
      },
      {
        q: 'Làm sao để tham gia hoặc được gỡ khỏi danh sách?',
        a: 'Liên hệ @mawkingbird@mastodon.social. Tài khoản nhỏ và ít đăng bài cũng được chào đón. Chúng tôi tôn trọng yêu cầu gỡ tên.',
      },
    ],
  },
};
